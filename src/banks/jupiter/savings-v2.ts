/**
 * Jupiter savings — V2 (emailed) statement format.
 *
 * Emailed by Federal Bank in the "ACCOUNT STATEMENT" format; the Jupiter brand
 * appears as the branch name "NEO BANKING- JUPITER" (split across two lines by
 * the text extractor).
 *
 * Layout (text-extracted):
 * - Page 1: colon-delimited metadata, e.g. "IFSC: FDRL0007778",
 *     "Customer ID (UCIC): XXXXX935", "Swift Code: FDRLINBBIBD".
 *   The account number is masked (e.g. "XXXXX0237").
 * - Page 2+: transaction table. Each row spans several physical lines:
 *     <txnDate> <valueDate> <particulars start…>
 *     <particulars cont…>
 *     <TranType> <TranId> <Withdrawal> <Deposits> <Balance> <CR|DR>
 *   Withdrawal/Deposits are mutually exclusive (the other is 0); direction is
 *   determined by which is non-zero, NOT by the trailing CR/DR (which is the
 *   running-balance indicator). Particulars wrap with a hyphen-space break.
 */

import type { AdapterResult, TransactionDetails, StatementSummary } from '@/types'
import { ParseError } from '@/types'
import { parseDate } from '@/util/date'
import { parseAmountToMinor } from '@/util/amount'
import { type Pages, extractMatch } from './savings-common'

const CURRENCY = 'INR'

const HOLDER_NAME = /Customer Name:\s*(.+?)\s*$/
const ACCOUNT_NUMBER = /Account Number:\s*([X\d]{6,})/
const CUSTOMER_ID = /Customer ID \(UCIC\):\s*([X\d]{6,})/
const IFSC_CODE = /IFSC:\s*([A-Z]{4}0[A-Z0-9]{6})/i
const SWIFT_CODE = /Swift Code:\s*([A-Z0-9]{8,11})/i
const MICR_CODE = /MICR code:\s*(\d{9})/

// "Statement Period: 08/02/2026 to 07/03/2026" — slash-date range.
const STATEMENT_PERIOD = /Statement Period:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+to\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i
// "Available Balance: 21,709.88" — the statement's closing balance.
const AVAILABLE_BALANCE = /Available Balance:\s*([\d,]+\.\d{2})/

// "09/02/2026 09/02/2026 UPIOUT/640630841010/vy-"
const ROW_START = /^(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(.*)$/
// "TFR S53543774 120 0 68290.94 CR" → type id withdrawal deposit balance cr/dr
const AMOUNT_LINE =
  /^[A-Z]{2,8}\s+\S+\s+(\d[\d,]*(?:\.\d+)?)\s+(\d[\d,]*(?:\.\d+)?)\s+[\d,]+\.\d{2}\s+(?:CR|DR)$/

export function readJupiterV2(pages: Pages): AdapterResult {
  const accountNumber = extractMatch(pages, ACCOUNT_NUMBER)
  if (!accountNumber) {
    throw new ParseError('Unable to extract account number from Jupiter PDF', { kind: 'parse-failed' })
  }

  const holderName = extractMatch(pages, HOLDER_NAME)
  const customerId = extractMatch(pages, CUSTOMER_ID)
  const ifscCode = extractMatch(pages, IFSC_CODE)
  const micrCode = extractMatch(pages, MICR_CODE)
  const swiftCode = extractMatch(pages, SWIFT_CODE)
  const transactions = parseTransactionLines(collectLines(pages))
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

// ── Statement summary extraction ───────────────────────

/**
 * Best-effort statement period + closing balance. A savings balance is an
 * asset, so `closingBalance` is stored positive. The emailed statement prints
 * its closing figure as "Available Balance". Missing figures are left
 * `undefined`; a statement with no figure at all is omitted.
 */
function extractStatement(pages: Pages): StatementSummary | undefined {
  const period = extractPeriod(pages)
  const available = extractMatch(pages, AVAILABLE_BALANCE)

  const summary: StatementSummary = {
    ...(period && { periodStart: period.start, periodEnd: period.end, asOf: period.end }),
    ...(available !== null && { closingBalance: parseAmountToMinor(available, CURRENCY, 1) }),
  }
  return Object.keys(summary).length > 0 ? summary : undefined
}

function extractPeriod(pages: Pages): { start: number; end: number } | undefined {
  for (const page of pages) {
    for (const line of page) {
      const match = STATEMENT_PERIOD.exec(line)
      if (match) return { start: parseDate(match[1]), end: parseDate(match[2]) }
    }
  }
  return undefined
}

/** Flatten every page into one line stream (headers/footers are skipped by the row parser). */
function collectLines(pages: Pages): string[] {
  const out: string[] = []
  for (const page of pages) out.push(...page)
  return out
}

function parseTransactionLines(lines: readonly string[]): TransactionDetails[] {
  const transactions: TransactionDetails[] = []

  for (let i = 0; i < lines.length; i++) {
    const startMatch = ROW_START.exec(lines[i])
    if (!startMatch) continue

    const row = collectRow(lines, i)
    if (!row) continue
    i = row.endIndex

    const transaction = parseRow(startMatch[1], startMatch[2], row.particulars, row.amount, transactions.length)
    if (transaction) transactions.push(transaction)
  }

  return transactions
}

/** Accumulate a row's wrapped particulars until its amount line. */
function collectRow(
  lines: readonly string[],
  start: number,
): { particulars: string[]; amount: RegExpExecArray; endIndex: number } | null {
  const particulars: string[] = []
  const limit = Math.min(start + 8, lines.length)
  for (let j = start + 1; j < limit; j++) {
    const amount = AMOUNT_LINE.exec(lines[j])
    if (amount) return { particulars, amount, endIndex: j }
    if (ROW_START.test(lines[j])) break
    particulars.push(lines[j])
  }
  return null
}

function parseRow(
  date: string,
  particularsStart: string,
  particularsRest: readonly string[],
  amount: RegExpExecArray,
  index: number,
): TransactionDetails | null {
  const withdrawal = amount[1]
  const deposit = amount[2]
  const isCredit = parseFloat(deposit.replace(/,/g, '')) > 0
  const sign: 1 | -1 = isCredit ? 1 : -1
  const amountText = isCredit ? deposit : withdrawal

  const description = cleanParticulars([particularsStart, ...particularsRest])
  if (!description) return null

  return {
    date: parseDate(date) + index,
    amount: parseAmountToMinor(amountText, CURRENCY, sign),
    description,
  }
}

/** Rejoin the hyphen-space wrap breaks the extractor inserts, then collapse whitespace. */
function cleanParticulars(parts: readonly string[]): string {
  return parts
    .join(' ')
    .replace(/-\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
