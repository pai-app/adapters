/**
 * SBI — Loan account adapter for the "Quarterly Loan Account (EMI) Statement"
 * PDF (a dedicated STATEMENT OF ACCOUNT for a DL/TL loan). Balances are the
 * outstanding principal (shown `DR`); a repayment lowers it (credit), interest
 * raises it (debit).
 */

import type { FileAdapter, AdapterResult, TransactionDetails, PdfFile, StatementSummary, AccountDetails } from '@/types'
import { ParseError } from '@/types'
import { parseDate } from '@/util/date'
import { parseAmountToMinor } from '@/util/amount'
import { SBI_IFSC_REGEX, SBI_AMOUNT_G, findIfsc } from './shared'

const CURRENCY = 'INR'
const TXN_HEADER = /Post Date\s+Value Date\s+Details/i
const STOP_LINE = /^Page no\.|CLOSING BALANCE|Statement Summary|END OF STATEMENT|Cr Count|Dr Count|Debits Credits|In the event of/i
// Records begin with a post-date + value-date pair; details run until the next pair.
const TXN_RECORD = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(.+?)(?=\s\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}|$)/g

type Pages = readonly (readonly string[])[]
type Row = { readonly date: number; readonly desc: string; readonly amount: string; readonly balance: number }

export const sbiLoanPdfAdapter: FileAdapter = {
  fileKind: 'pdf',

  isSupported(file) {
    const joined = (file as PdfFile).pages.map((p) => p.join(' ')).join(' ')
    return SBI_IFSC_REGEX.test(joined) && /STATEMENT OF ACCOUNT/i.test(joined) && TXN_HEADER.test(joined)
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(file) {
    return readSbiLoan((file as PdfFile).pages)
  },
}

function readSbiLoan(pages: Pages): AdapterResult {
  const account = extractAccount(pages)
  if (!account.accountNumber) {
    throw new ParseError('Unable to extract account number from SBI loan statement', { kind: 'parse-failed' })
  }
  const rows = collectRows(pages)
  const transactions: TransactionDetails[] = rows.map((r, i) => ({
    date: r.date,
    description: r.desc,
    amount: parseAmountToMinor(r.amount, CURRENCY, signOf(rows, i)),
  }))
  const statement = extractStatement(pages, rows)
  return { account, transactions, ...(statement && { statement }) }
}

// ── Account details ─────────────────────────────────────

function extractAccount(pages: Pages): AccountDetails {
  const joined = pages.map((p) => p.join(' ')).join(' ')
  const accountNumber = firstMatch(pages, /^\d{10,}$/)
  const holder = extractHolder(pages)
  const ifsc = findIfsc(joined)
  const micr = /MICR Code\s*:\s*(\d{9})/i.exec(joined)?.[1]
  return {
    currency: CURRENCY,
    ...(accountNumber && { accountNumber: [accountNumber] }),
    ...(holder && { accountHolderName: [holder] }),
    ...(ifsc && { ifscCode: [ifsc] }),
    ...(micr && { micrCode: [micr] }),
  }
}

/** First trimmed line across all pages fully matching `re`. */
function firstMatch(pages: Pages, re: RegExp): string | null {
  for (const page of pages) {
    for (const line of page) {
      if (re.test(line.trim())) return line.trim()
    }
  }
  return null
}

/** Uppercase holder name lines that follow the `Product …` line. */
function extractHolder(pages: Pages): string | null {
  for (const page of pages) {
    const idx = page.findIndex((l) => /^Product\b/i.test(l.trim()))
    if (idx < 0) continue
    const parts: string[] = []
    for (let j = idx + 1; j < page.length; j++) {
      const line = page[j].trim()
      if (!/^[A-Z][A-Z .]*[A-Z]$/.test(line)) break
      parts.push(line)
    }
    if (parts.length > 0) return parts.join(' ')
  }
  return null
}

// ── Transactions ────────────────────────────────────────

/** Body lines (post-header, pre-footer) across all pages, parsed into rows. */
function collectRows(pages: Pages): Row[] {
  const lines: string[] = []
  for (const page of pages) {
    const start = page.findIndex((l) => TXN_HEADER.test(l))
    if (start < 0) continue
    for (let i = start + 1; i < page.length; i++) {
      if (STOP_LINE.test(page[i].trim())) break
      lines.push(page[i])
    }
  }
  return parseRows(lines.join(' '))
}

function parseRows(joined: string): Row[] {
  const rows: Row[] = []
  for (const m of joined.matchAll(TXN_RECORD)) {
    const [, dateStr, rest] = m
    const amounts = [...rest.matchAll(SBI_AMOUNT_G)].map((a) => a[0])
    if (amounts.length < 2) continue // rate-change / non-monetary row
    const desc = rest.replace(SBI_AMOUNT_G, '').replace(/\b[DC]R\b/g, '').replace(/\s+/g, ' ').trim()
    rows.push({
      date: parseDate(dateStr) + rows.length,
      desc,
      amount: amounts[0],
      balance: parseFloat(amounts[amounts.length - 1].replace(/,/g, '')),
    })
  }
  return rows
}

/**
 * Sign a row by outstanding-balance movement: a drop is a repayment (credit,
 * `+`), a rise is an interest/charge (debit, `−`). The first row has no prior
 * balance, so fall back to its description.
 */
function signOf(rows: readonly Row[], i: number): 1 | -1 {
  if (i > 0) return rows[i].balance < rows[i - 1].balance ? 1 : -1
  return /REPAYMENT|CREDIT|REVERSAL|REFUND/i.test(rows[i].desc) ? 1 : -1
}

// ── Statement summary ───────────────────────────────────

/** Period + closing outstanding. A loan is a liability, so `closingBalance` is negative. */
function extractStatement(pages: Pages, rows: readonly Row[]): StatementSummary | undefined {
  const joined = pages.map((p) => p.join(' ')).join(' ')
  const period = /Statement From (\d{2}-\d{2}-\d{4}) To (\d{2}-\d{2}-\d{4})/i.exec(joined)
  const lastBalance = rows.length > 0 ? rows[rows.length - 1].balance : undefined
  const summary: StatementSummary = {
    ...(period && { periodStart: parseDate(period[1]), periodEnd: parseDate(period[2]), asOf: parseDate(period[2]) }),
    ...(lastBalance !== undefined && { closingBalance: parseAmountToMinor(String(lastBalance), CURRENCY, -1) }),
  }
  return Object.keys(summary).length > 0 ? summary : undefined
}
