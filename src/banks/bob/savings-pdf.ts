/**
 * Bank of Baroda — Savings account e-statement PDF adapter.
 *
 * BoB mails a password-protected monthly e-statement (sender
 * `estatement@bankofbaroda.bank.in`). The document carries a single
 * "Statement of transactions in Savings Account" table where every row reads
 * `DD-MM-YYYY <narration> <amount> <balance> Cr|Dr`. A row carries exactly one
 * money figure (a withdrawal OR a deposit) plus the running balance; the
 * debit/credit column is not labelled per row, so the sign is derived from the
 * balance movement (mirrors the SBI/HDFC approach). Long narrations wrap across
 * lines, so each transaction is a record delimited by the next date line.
 */

import type {
  FileAdapter,
  TransactionDetails,
  PdfFile,
  StatementSummary,
  AccountDetails,
} from '@/types'
import { ParseError } from '@/types'
import { parseDate } from '@/util/date'
import { parseAmountToMinor, parseAmountFloat } from '@/util/amount'
import { MONTH_NAMES } from '@/util/regex'
import { BOB_STATEMENT_MARKER } from './shared'

const CURRENCY = 'INR'

const TXN_HEADER = /^DATE\s+NARRATION/i
const TXN_END = /^ABBREVIATIONS/i
const DATE_LINE = /^(\d{2}-\d{2}-\d{4})\b/
// Two-decimal money value, not followed by a further digit.
const MONEY_G = /[\d,]+\.\d{2}(?!\d)/g
// A balance figure with its `Cr`/`Dr` suffix (global — take the last match).
const BALANCE_G = /([\d,]+\.\d{2})\s*(Cr|Dr)\b/gi
// Whether a record already carries its terminal `<amount> Cr|Dr` balance.
const HAS_BALANCE = /[\d,]+\.\d{2}\s*(?:Cr|Dr)\b/i
const OPENING = /Opening\s+Balance/i
const CLOSING = /Closing\s+Balance/i
const NO_TXNS = /No Transactions exist/i
const PERIOD =
  /Statement Period from\s+(\w{3})\s+(\d{1,2}),\s*(\d{4})\s+to\s+(\w{3})\s+(\d{1,2}),\s*(\d{4})/i
const ACCOUNT_NUMBER = /Savings Account\s+(\d{10,})\s+in\b/i
const HOLDER = /^(?:MR|MRS|MS)\.?\s+([A-Z][A-Za-z. ]+)$/
const CUSTOMER_ID = /CUSTOMER ID\s*-\s*([A-Z0-9]+)/i
const MICR_IFSC = /(\d{9})\s+(BARB0[A-Z0-9]{6})/i

type Pages = readonly (readonly string[])[]

export const bobSavingsPdfAdapter: FileAdapter = {
  fileKind: 'pdf',

  isSupported(file) {
    const pdf = file as PdfFile
    const joined = pdf.pages.map((p) => p.join(' ')).join(' ')
    // The transaction-table marker is unique to a BoB savings e-statement and
    // is present on every layout — including older statements whose header
    // omits the MICR/IFSC line. Match on it alone; the IFSC (when present) is
    // optional metadata extracted later, never a gate for recognition.
    return BOB_STATEMENT_MARKER.test(joined)
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(file) {
    const lines = flatten((file as PdfFile).pages)
    const account = extractAccount(lines)
    const transactions = extractTransactions(lines)
    const statement = extractStatement(lines)
    return { account, transactions, ...(statement && { statement }) }
  },
}

function flatten(pages: Pages): string[] {
  return pages.flatMap((page) => page.map((line) => line))
}

// ── Account details ─────────────────────────────────────

function extractAccount(lines: readonly string[]): AccountDetails {
  const joined = lines.join(' ')
  const accountNumber = ACCOUNT_NUMBER.exec(joined)?.[1]
  if (!accountNumber) {
    throw new ParseError('Unable to extract account number from Bank of Baroda statement', {
      kind: 'parse-failed',
    })
  }
  const holder = extractHolder(lines)
  const customerId = CUSTOMER_ID.exec(joined)?.[1]
  const micrIfsc = MICR_IFSC.exec(joined)
  return {
    currency: CURRENCY,
    accountNumber: [accountNumber],
    ...(holder && { accountHolderName: [holder] }),
    ...(customerId && { customerId: [customerId] }),
    ...(micrIfsc && { ifscCode: [micrIfsc[2].toUpperCase()], micrCode: [micrIfsc[1]] }),
  }
}

/** Holder name from the salutation line (`MR. JOHN A SMITH`). */
function extractHolder(lines: readonly string[]): string | undefined {
  for (const line of lines) {
    const match = HOLDER.exec(line.trim())
    if (match?.[1]) return match[1].trim()
  }
  return undefined
}

// ── Transactions ────────────────────────────────────────

function extractTransactions(lines: readonly string[]): TransactionDetails[] {
  const start = lines.findIndex((line) => TXN_HEADER.test(line))
  if (start < 0) {
    throw new ParseError('No transaction table in Bank of Baroda statement', { kind: 'parse-failed' })
  }

  const section: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (TXN_END.test(lines[i])) break
    section.push(lines[i])
  }

  const transactions: TransactionDetails[] = []
  let prevBalance: number | null = null

  for (const record of groupRecords(section)) {
    const text = record.join(' ').replace(/\s+/g, ' ').trim()
    const dateStr = DATE_LINE.exec(text)?.[1]
    /* v8 ignore next -- groupRecords only starts a record on a date line */
    if (!dateStr) continue

    if (OPENING.test(text)) {
      prevBalance = signedBalance(text)
      continue
    }
    if (CLOSING.test(text) || NO_TXNS.test(text)) continue

    const money = [...text.matchAll(MONEY_G)]
    /* v8 ignore next -- a transaction row always carries amount + balance */
    if (money.length < 2) continue

    const amountToken = money[money.length - 2]
    const newBalance = signedBalance(text)
    const sign: 1 | -1 = prevBalance !== null && newBalance < prevBalance ? -1 : 1
    prevBalance = newBalance

    const description = text.slice(dateStr.length, amountToken.index).replace(/\s+/g, ' ').trim()
    transactions.push({
      date: parseDate(dateStr) + transactions.length,
      amount: parseAmountToMinor(amountToken[0], CURRENCY, sign),
      description,
    })
  }

  return transactions
}

/**
 * Group section lines into transaction records. A record begins at a
 * date-prefixed line and ends once it carries its `<amount> Cr|Dr` balance.
 * Wrapped narration lines attach to the open record — even when a wrapped line
 * itself begins with a `DD-MM-YYYY` token (e.g. an interest period like
 * `…01-02-2026 to 30-04-2026`), because that record is not yet balance-terminated.
 */
function groupRecords(section: readonly string[]): string[][] {
  const records: string[][] = []
  let current: string[] | null = null
  for (const line of section) {
    const complete = current === null || HAS_BALANCE.test(current.join(' '))
    if (DATE_LINE.test(line) && complete) {
      current = [line]
      records.push(current)
    } else if (current) {
      current.push(line)
    }
  }
  return records
}

/** The signed value of the last `<amount> Cr|Dr` balance token in a record. */
function signedBalance(text: string): number {
  let last: RegExpExecArray | null = null
  let match: RegExpExecArray | null
  BALANCE_G.lastIndex = 0
  while ((match = BALANCE_G.exec(text)) !== null) last = match
  /* v8 ignore next -- every balance-bearing row ends in a Cr/Dr figure */
  if (!last) return 0
  const value = parseAmountFloat(last[1])
  return /dr/i.test(last[2]) ? -value : value
}

// ── Statement summary ───────────────────────────────────

/**
 * Best-effort period + closing balance. A savings balance is an asset, so
 * `closingBalance` is stored positive (negative only under an overdraft `Dr`).
 */
function extractStatement(lines: readonly string[]): StatementSummary | undefined {
  const joined = lines.join(' ')
  const period = PERIOD.exec(joined)
  const closing = extractClosingBalance(lines)

  const summary: StatementSummary = {
    ...(period && {
      periodStart: monDayYear(period[1], period[2], period[3]),
      periodEnd: monDayYear(period[4], period[5], period[6]),
      asOf: monDayYear(period[4], period[5], period[6]),
    }),
    ...(closing !== undefined && { closingBalance: closing }),
  }
  return Object.keys(summary).length > 0 ? summary : undefined
}

function extractClosingBalance(lines: readonly string[]): number | undefined {
  const line = lines.find((candidate) => CLOSING.test(candidate))
  if (!line) return undefined
  BALANCE_G.lastIndex = 0
  const match = BALANCE_G.exec(line)
  /* v8 ignore next -- a Closing Balance row always carries a Cr/Dr figure */
  if (!match) return undefined
  return parseAmountToMinor(match[1], CURRENCY, /dr/i.test(match[2]) ? -1 : 1)
}

/** Build a ms-epoch (UTC midnight) from a `Mon DD YYYY` triple. */
function monDayYear(month: string, day: string, year: string): number {
  const monthIdx = MONTH_NAMES.indexOf(month.toLowerCase())
  return Date.UTC(parseInt(year, 10), monthIdx, parseInt(day, 10))
}
