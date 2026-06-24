/**
 * HDFC Bank — Credit Card PDF statement adapter.
 *
 * Ported from fin-old `HdfcCreditCardPdfAdapter`. Logic preserved; adapted to
 * the new type contracts (`FileAdapter`, `AdapterResult`, minor-unit amounts).
 */

import type { FileAdapter, AdapterResult, TransactionDetails, PdfFile, StatementSummary } from '@/types'
import { ParseError } from '@/types'
import { parseDate, parseDateTime } from '@/util/date'
import { parseAmountToMinor } from '@/util/amount'
import { INDIAN_AMOUNT, INDIAN_AMOUNT_G } from '@/util/regex'

const CURRENCY = 'INR'

// ── Identification ──────────────────────────────────────

const CREDIT_CARD_GSTIN = /HDFC Bank Credit Cards GSTIN/i
const CREDIT_CARD_STATEMENT = /Credit Card Statement/i

// ── Account number ──────────────────────────────────────

const CARD_NUMBER_LABEL = /Credit Card No\./i
const ALT_ACCOUNT_LABEL = /Alternate Account Number/i
const MASKED_CARD = /\d[\dX]{11,}/i
const NUMERIC_ACCOUNT = /\d{10,}/

// ── Account holder ──────────────────────────────────────

const TX_HEADER = /DATE & TIME\s+TRANSACTION DESCRIPTION/i
const HOLDER_NAME = /^[A-Z][A-Z\s]+[A-Z]$/

// ── Statement summary ───────────────────────────────────

const BILLING_PERIOD_LABEL = /Billing Period/i
const PAYMENT_DUE_LABEL = /(?:Payment )?Due Date/i
const TOTAL_DUE_LABEL = /Total Amount Due|Total Dues/i
const MIN_DUE_LABEL = /Minimum (?:Amount )?Due/i
// `^` anchor keeps this off the "Available Credit Limit" header.
const CREDIT_LIMIT_LABEL = /^(?:Total )?Credit Limit/i
const AVAILABLE_CREDIT_LABEL = /Available Credit Limit/i
// HDFC prints dates as `DD/MM/YYYY` (savings-style cards) or `DD Mon[,] YYYY`
// (Diners-style cards); accept both.
const ANY_DATE = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})/
const PERIOD_RANGE =
  /(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})\s*(?:to|-|–)\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})/i

// ── Transactions ────────────────────────────────────────

const DATE_TIME = /^(\d{2}\/\d{2}\/\d{4})\|\s*(\d{2}:\d{2})/
const REWARDS_AMOUNT = /\+\s*(\d*)\s*C\s*([\d,]+(?:\.\d+)?)/

const SKIP_LINES = [
  /^Page \d+ of \d+/i,
  /^Domestic Transactions$/i,
  /^International Transactions$/i,
  /^DATE & TIME\s+TRANSACTION DESCRIPTION/i,
  /^Eligible for\s+EMI/i,
  /^TOTAL AMOUNT$/i,
  /^Rewards Program Points Summary/i,
  /^SR NO\.\s+PROGRAMS/i,
  /^Important Information$/i,
  /^Useful Links$/i,
  /^Statement & Payment/i,
  /^MITC /i,
  /^Payment Options/i,
  /^Customer Rights Policy/i,
  /^HSN Code/i,
  /^HDFC Bank Credit Cards GSTIN/i,
]

type Pages = readonly (readonly string[])[]

export const hdfcCreditPdfAdapter: FileAdapter = {
  fileKind: 'pdf',

  isSupported(file) {
    const pdf = file as PdfFile
    return pdf.pages.some(
      (page) =>
        page.some((l) => CREDIT_CARD_GSTIN.test(l)) &&
        page.some((l) => CREDIT_CARD_STATEMENT.test(l)),
    )
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(file) {
    const pdf = file as PdfFile
    return readHdfcCreditPdf(pdf.pages)
  },
}

function readHdfcCreditPdf(pages: Pages): AdapterResult {
  const accountNumber = extractAccountNumber(pages)
  if (!accountNumber) {
    throw new ParseError('Unable to extract account number from HDFC credit card PDF', { kind: 'parse-failed' })
  }

  const holderName = extractHolderName(pages)
  const altAccount = extractAltAccountNumber(pages)
  const transactions = extractTransactions(pages)
  const statement = extractStatement(pages)

  return {
    account: {
      currency: CURRENCY,
      accountNumber: [accountNumber],
      ...(holderName && { accountHolderName: [holderName] }),
      ...(altAccount && { customerId: [altAccount] }),
    },
    transactions,
    ...(statement && { statement }),
  }
}

// ── Statement summary extraction ────────────────────────

/**
 * Best-effort extraction of the statement's closing figures. The total amount
 * due is a liability, so `closingBalance` is stored negative; `minimumDue`,
 * `creditLimit`, and `available` are stored positive. Any figure that cannot be
 * found is left `undefined` — a missing figure never fails the parse.
 */
function extractStatement(pages: Pages): StatementSummary | undefined {
  const period = extractBillingPeriod(pages)
  const dueDate = findDateAfterLabel(pages, PAYMENT_DUE_LABEL)
  const totalDue = findAmountAfterLabel(pages, TOTAL_DUE_LABEL)
  const minimumDue = findAmountAfterLabel(pages, MIN_DUE_LABEL)
  const creditLimit = findAmountAfterLabel(pages, CREDIT_LIMIT_LABEL)
  // Available credit is optional: only emit it when a single amount sits next
  // to the label (some cards pack total/available/cash on one multi-amount row).
  const available = findSingleAmountAfterLabel(pages, AVAILABLE_CREDIT_LABEL)

  const summary: StatementSummary = {
    ...(period && { periodStart: period.start, periodEnd: period.end, asOf: period.end }),
    ...(totalDue !== undefined && { closingBalance: parseAmountToMinor(totalDue, CURRENCY, -1) }),
    ...(available !== undefined && { available: parseAmountToMinor(available, CURRENCY, 1) }),
    ...(creditLimit !== undefined && { creditLimit: parseAmountToMinor(creditLimit, CURRENCY, 1) }),
    ...(minimumDue !== undefined && { minimumDue: parseAmountToMinor(minimumDue, CURRENCY, 1) }),
    ...(dueDate !== undefined && { dueDate }),
  }
  return Object.keys(summary).length > 0 ? summary : undefined
}

function extractBillingPeriod(pages: Pages): { start: number; end: number } | undefined {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (!BILLING_PERIOD_LABEL.test(page[i])) continue
      for (let j = i; j < Math.min(i + 6, page.length); j++) {
        const match = PERIOD_RANGE.exec(page[j])
        if (match) return { start: parseFlexDate(match[1]), end: parseFlexDate(match[2]) }
      }
    }
  }
  return undefined
}

function findDateAfterLabel(pages: Pages, labelRe: RegExp): number | undefined {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (!labelRe.test(page[i])) continue
      for (let j = i; j < Math.min(i + 3, page.length); j++) {
        const match = ANY_DATE.exec(page[j])
        if (match?.[1]) return parseFlexDate(match[1])
      }
    }
  }
  return undefined
}

function findAmountAfterLabel(pages: Pages, labelRe: RegExp): string | undefined {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (!labelRe.test(page[i])) continue
      for (let j = i; j < Math.min(i + 4, page.length); j++) {
        const match = INDIAN_AMOUNT.exec(page[j])
        if (match?.[1]) return match[1]
      }
    }
  }
  return undefined
}

function findSingleAmountAfterLabel(pages: Pages, labelRe: RegExp): string | undefined {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (!labelRe.test(page[i])) continue
      for (let j = i; j < Math.min(i + 3, page.length); j++) {
        const amounts = [...page[j].matchAll(INDIAN_AMOUNT_G)]
        if (amounts.length === 1) return amounts[0][1]
        if (amounts.length > 1) return undefined
      }
    }
  }
  return undefined
}

/** Parse a `DD/MM/YYYY` or `DD Mon[,] YYYY` date to ms epoch. */
function parseFlexDate(text: string): number {
  return parseDate(text.replace(/,/g, ' ').replace(/\s+/g, ' ').trim())
}

// ── Metadata extraction ─────────────────────────────────

function extractAccountNumber(pages: Pages): string | null {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (!CARD_NUMBER_LABEL.test(page[i])) continue
      for (let j = i; j < Math.min(i + 5, page.length); j++) {
        const match = MASKED_CARD.exec(page[j])
        if (match) return match[0]
      }
    }
  }
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (!ALT_ACCOUNT_LABEL.test(page[i])) continue
      for (let j = i; j < Math.min(i + 5, page.length); j++) {
        const match = NUMERIC_ACCOUNT.exec(page[j])
        if (match) return match[0]
      }
    }
  }
  return null
}

function extractHolderName(pages: Pages): string | null {
  for (const page of pages) {
    for (let i = 0; i < page.length - 1; i++) {
      if (!TX_HEADER.test(page[i])) continue
      for (let j = i + 1; j < Math.min(i + 3, page.length); j++) {
        const line = page[j].trim()
        if (DATE_TIME.test(line)) break
        if (HOLDER_NAME.test(line)) return line
      }
    }
  }
  return null
}

function extractAltAccountNumber(pages: Pages): string | null {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (!ALT_ACCOUNT_LABEL.test(page[i])) continue
      for (let j = i + 1; j < Math.min(i + 8, page.length); j++) {
        const line = page[j].trim()
        if (/^Statement Date$/i.test(line) || /^Billing Period$/i.test(line)) continue
        const match = NUMERIC_ACCOUNT.exec(line)
        if (match) return match[0]
      }
    }
  }
  return null
}

// ── Transaction extraction ──────────────────────────────

function extractTransactions(pages: Pages): TransactionDetails[] {
  const allLines: string[] = []
  for (const page of pages) {
    for (const line of page) {
      if (!SKIP_LINES.some((re) => re.test(line.trim()))) {
        allLines.push(line)
      }
    }
  }
  return parseTransactionLines(allLines)
}

function parseTransactionLines(lines: string[]): TransactionDetails[] {
  const transactions: TransactionDetails[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const dateMatch = DATE_TIME.exec(line)
    if (!dateMatch?.[1] || !dateMatch[2]) continue

    // Merge continuation lines
    let merged = line
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      if (DATE_TIME.test(lines[j])) break
      if (REWARDS_AMOUNT.test(merged)) break
      merged += ' ' + lines[j]
      i = j
    }

    const rewardsMatch = REWARDS_AMOUNT.exec(merged)
    if (!rewardsMatch?.[2]) continue

    const rewardPointsStr = rewardsMatch[1]
    const isCredit = rewardPointsStr === ''
    const sign: 1 | -1 = isCredit ? 1 : -1

    const date = parseDateTime(`${dateMatch[1]} ${dateMatch[2]}:00`) + transactions.length

    // Description = text between datetime prefix and rewards/amount
    const rewardsIdx = merged.indexOf(rewardsMatch[0])
    let description = merged.slice(dateMatch[0].length, rewardsIdx).trim()
    description = description.replace(/\s+/g, ' ').trim()

    transactions.push({
      date,
      amount: parseAmountToMinor(rewardsMatch[2], CURRENCY, sign),
      description,
    })
  }

  return transactions
}
