/**
 * Jupiter savings — V1 (app-download) statement format.
 *
 * Downloaded from the Jupiter app; issued in Federal Bank's "STATEMENT OF
 * ACCOUNT" format, branded "Fintech Partnerships (Jupiter)".
 *
 * Layout (text-extracted):
 * - Page 1: account holder + metadata as inline "Label Value" pairs, e.g.
 *     "Name ABHAY JATIN DOSHI Branch Name Fintech Partnerships (Jupiter)"
 *     "Registered Mobile Number 9XXXXXXXXX Account Number 7778XXXXXXXXXX"
 * - Page 1+: transaction table. Each row is a single line:
 *     <txnDate> <valueDate> <particulars…> TFR <amount> <balance> <Dr|Cr>
 *   The trailing Dr/Cr is the transaction direction (Dr = debit, Cr = credit).
 *   Particulars occasionally wrap across physical lines.
 */

import type { AdapterResult, TransactionDetails, StatementSummary } from '@/types'
import { ParseError } from '@/types'
import { parseDate } from '@/util/date'
import { parseAmountToMinor } from '@/util/amount'
import { type Pages, extractMatch } from './savings-common'

const CURRENCY = 'INR'

const HOLDER_NAME = /^Name\s+(.+?)\s+Branch Name\b/
const ACCOUNT_NUMBER = /Account Number\s+(\d{10,})/
const CUSTOMER_ID = /Customer ID\s+(\d{6,})/
const IFSC_CODE = /^IFSC\s+([A-Z]{4}0[A-Z0-9]{6})\b/
const MICR_CODE = /MICR Code\s+(\d{9})\b/
const SWIFT_CODE = /SWIFT Code\s+([A-Z0-9]{8,11})\b/

// "STATEMENT OF ACCOUNT PERIOD : 01-MAR-2026 to 31-MAR-2026" — DD-MON-YYYY range.
const STATEMENT_PERIOD = /PERIOD\s*:?\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})\s+to\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i

const DATE_START = /^\d{1,2}\/\d{1,2}\/\d{2,4}\b/
const FIRST_DATE = /^(\d{1,2}\/\d{1,2}\/\d{2,4})/
const DATE_TOKEN = /\d{1,2}\/\d{1,2}\/\d{2,4}/g
const AMOUNT_TOKEN = /\d+\.\d{2}/g
const PAGE_FOOTER = /^Page\b/i
const GRAND_TOTAL = /^GRAND TOTAL\b/i

export function readJupiterV1(pages: Pages): AdapterResult {
  const accountNumber = extractMatch(pages, ACCOUNT_NUMBER)
  if (!accountNumber) {
    throw new ParseError('Unable to extract account number from Jupiter PDF', { kind: 'parse-failed' })
  }

  const holderName = extractMatch(pages, HOLDER_NAME)
  const customerId = extractMatch(pages, CUSTOMER_ID)
  const ifscCode = extractMatch(pages, IFSC_CODE)
  const micrCode = extractMatch(pages, MICR_CODE)
  const swiftCode = extractMatch(pages, SWIFT_CODE)
  const transactions = parseTransactionLines(collectTransactionLines(pages))
  const statement = extractStatement(pages)

  return {
    account: {
      currency: CURRENCY,
      accountNumber: [accountNumber],
      ...(holderName && { accountHolderName: [holderName] }),
      ...(customerId && { customerId: [customerId] }),
      ...(ifscCode && { ifscCode: [ifscCode.toUpperCase()] }),
      ...(micrCode && { micrCode: [micrCode] }),
      ...(swiftCode && { swiftCode: [swiftCode.toUpperCase()] }),
    },
    transactions,
    ...(statement && { statement }),
  }
}

// ── Statement summary extraction ────────────────────────

/**
 * Best-effort statement period + closing balance. A savings balance is an
 * asset, so `closingBalance` is stored positive. The closing balance is the
 * running balance on the final transaction row. Missing figures are left
 * `undefined`; a statement with no figure at all is omitted.
 */
function extractStatement(pages: Pages): StatementSummary | undefined {
  const period = extractPeriod(pages)
  const closingBalance = extractClosingBalance(pages)

  const summary: StatementSummary = {
    ...(period && { periodStart: period.start, periodEnd: period.end, asOf: period.end }),
    ...(closingBalance !== undefined && { closingBalance }),
  }
  return Object.keys(summary).length > 0 ? summary : undefined
}

function extractPeriod(pages: Pages): { start: number; end: number } | undefined {
  for (const page of pages) {
    for (const line of page) {
      const match = STATEMENT_PERIOD.exec(line)
      if (match) return { start: parseMonthDate(match[1]), end: parseMonthDate(match[2]) }
    }
  }
  return undefined
}

/** The closing balance is the running balance printed on the last txn row. */
function extractClosingBalance(pages: Pages): number | undefined {
  const lines = collectTransactionLines(pages)
  let balance: string | undefined
  for (let i = 0; i < lines.length; i++) {
    if (!FIRST_DATE.test(lines[i])) continue
    const merged = mergeRowLines(lines, i)
    if (!merged) continue
    i = merged.endIndex
    const amounts = merged.text.match(AMOUNT_TOKEN)
    if (amounts && amounts.length >= 2) balance = amounts[amounts.length - 1]
  }
  return balance !== undefined ? parseAmountToMinor(balance, CURRENCY, 1) : undefined
}

/** Parse a `DD-MON-YYYY` date (e.g. `31-MAR-2026`) to ms epoch. */
function parseMonthDate(text: string): number {
  return parseDate(text.replace(/-/g, ' '))
}

/**
 * Slice each page to its transaction region — from the first date row down to
 * (but excluding) the page footer or GRAND TOTAL — then concatenate. This
 * strips repeated headers/footers so the row parser sees a clean stream.
 */
function collectTransactionLines(pages: Pages): string[] {
  const out: string[] = []
  for (const page of pages) {
    const start = page.findIndex((l) => DATE_START.test(l))
    if (start === -1) continue
    let end = page.length
    for (let i = start; i < page.length; i++) {
      if (PAGE_FOOTER.test(page[i]) || GRAND_TOTAL.test(page[i])) {
        end = i
        break
      }
    }
    out.push(...page.slice(start, end))
  }
  return out
}

function parseTransactionLines(lines: readonly string[]): TransactionDetails[] {
  const transactions: TransactionDetails[] = []

  for (let i = 0; i < lines.length; i++) {
    const firstDate = FIRST_DATE.exec(lines[i])?.[1]
    if (!firstDate) continue

    const merged = mergeRowLines(lines, i)
    if (!merged) continue
    i = merged.endIndex

    const transaction = parseRow(merged.text, firstDate, transactions.length)
    if (transaction) transactions.push(transaction)
  }

  return transactions
}

/** Accumulate physical lines of a row starting at `start`. */
function mergeRowLines(
  lines: readonly string[],
  start: number,
): { text: string; endIndex: number } | null {
  let text = ''
  const limit = Math.min(5, lines.length - start)
  for (let j = 0; j < limit; j++) {
    text += lines[start + j] + ' '
    const amounts = text.match(AMOUNT_TOKEN)
    if (amounts && amounts.length >= 1) {
      const next = start + j + 1
      if (next >= lines.length || DATE_START.test(lines[next])) {
        return { text, endIndex: start + j }
      }
    }
  }
  return null
}

/** Parse a merged single-row string into a transaction, or null to skip it. */
function parseRow(text: string, firstDate: string, index: number): TransactionDetails | null {
  const amounts = text.match(AMOUNT_TOKEN) ?? []
  if (amounts.length < 2) return null
  const amountText = amounts[0]

  let rest = text.replace(DATE_TOKEN, ' ').replace(AMOUNT_TOKEN, ' ').replace(/\bTFR\b/, ' ')

  let sign: 1 | -1 = 1
  if (/\bCr\b/.test(rest)) {
    rest = rest.replace(/\bCr\b/, ' ')
  } else if (/\bDr\b/.test(rest)) {
    sign = -1
    rest = rest.replace(/\bDr\b/, ' ')
  }

  const description = rest.replace(/\s+/g, ' ').trim()
  if (!description) return null

  return {
    date: parseDate(firstDate) + index,
    amount: parseAmountToMinor(amountText, CURRENCY, sign),
    description,
  }
}
