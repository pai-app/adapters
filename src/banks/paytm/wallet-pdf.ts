/**
 * Paytm Payments Bank — Wallet PDF statement adapter.
 *
 * Ported from fin-old `PaytmBankWalletPdfAdapter`. Logic preserved; adapted
 * to the new type contracts.
 *
 * Wallet statements have two transaction formats:
 * - **Combined**: sign + amount + description + balance + date on one line.
 * - **Separated**: time line → amount line → description/date lines.
 */

import type { FileAdapter, AdapterResult, TransactionDetails, PdfFile, StatementSummary } from '@/types'
import { ParseError } from '@/types'
import { parseAmountToMinor } from '@/util/amount'
import {
  CURRENCY, TIME_REGEX, SKIP_AFTER, SKIP_DESCRIPTION, parseDateTimeAmPm, parseLongDate,
} from './shared'

// ── Identification ──────────────────────────────────────

const PAYTM_ID = /Paytm|PPBL/i
const WALLET_STMT = /wallet statement|balance statement/i

// ── Account ─────────────────────────────────────────────

const PHONE_NUMBER = /(\+\d{1,3}-\d{10})/
const HOLDER_NAME = /^([A-Z][A-Z\s]+[A-Z])$/

// ── Transaction amount patterns ─────────────────────────

const AMOUNT_ONLY = /^([+-])\s*(?:Rs\.|₹)\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)$/
// Combined line packs amount, description, balance and date together. Depending
// on the PDF's internal layout, the text extractor may or may not emit spaces
// between the amount and the description, and between the balance and the date
// (e.g. "- Rs.200.00Paid to X Rs.030 JUL 23"). So those joins are `\s*`, and the
// date day is pinned to exactly two digits to disambiguate the glued balance.
const COMBINED =
  /^([+-])\s*Rs\.\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)\s*(.+?)\s+Rs\.\s*\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?\s*(\d{2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4})$/i
const INLINE_DATE = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4})/i
const RS_BALANCE = /Rs\.\s*\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?/g

// ── Statement summary ───────────────────────────────────

// History-style statements print a labelled summary: a `<start> to <end>`
// period and a `Closing Balance` block (label, date, then `Rs.<value>`). Simple
// single-month statements carry neither, so the summary is omitted for those.
const WALLET_PERIOD =
  /Wallet statement for\s+(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})\s+to\s+(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/i
const CLOSING_LABEL = /^Closing Balance$/i
// Looser than INDIAN_AMOUNT so a bare `Rs.0` closing balance is captured too.
const RS_AMOUNT = /Rs\.\s*([\d,]+(?:\.\d{2})?)/

// ── Skip patterns ───────────────────────────────────────

const SKIP_HEADER: readonly RegExp[] = [
  /^DATE[\s]+&[\s]+TIME[\s]+TRANSACTION[\s]+DETAILS[\s]+(?:AVAILABLE|CLOSING)[\s]+BALANCE/i,
  /^TRANSACTION DETAILS$/i,
  /^AVAILABLE BALANCE$/i,
  /^CLOSING BALANCE$/i,
  /^AMOUNT$/i,
  /^Opening Balance/i,
  /^Closing Balance/i,
  /^Expenses\/Transfer/i,
  /^Cashback$/i,
  /^Added\/Received/i,
  /^Refund$/i,
  /^Combined Wallet/i,
  /^Balance as on/i,
  /^as on\s+as on$/i,
  /^Wallet statement for/i,
  /^(?:Paytm )?(?:Wallet|Balance) statement for/i,
  /^Rs\.$/i,
  /^₹$/i,
  /^\d+$/,
  /^\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i,
  /^[\d,]+\.\d{2}\s+Rs\.$/i,
  /^\d+\s+Rs\.[\d,]+\.\d{2}$/i,
  /cKYC ID/i,
  /^\+\d{1,3}-\d{10}$/,
  /@(?!.*Transaction ID)/i,
  /^[A-Z][\d]+,.*(?:Sector|Pradesh|Towers|Building|Floor|Noida|India)/i,
]

type Pages = readonly (readonly string[])[]

export const paytmWalletPdfAdapter: FileAdapter = {
  fileKind: 'pdf',

  isSupported(file) {
    const pdf = file as PdfFile
    return (
      pdf.pages.some((p) => p.some((l) => PAYTM_ID.test(l))) &&
      pdf.pages.some((p) => p.some((l) => WALLET_STMT.test(l)))
    )
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(file) {
    const pdf = file as PdfFile
    return readPaytmWalletPdf(pdf.pages)
  },
}

function readPaytmWalletPdf(pages: Pages): AdapterResult {
  const account = extractAccountDetails(pages)
  if (!account.accountNumber?.[0]) {
    throw new ParseError('Unable to extract account from Paytm wallet PDF', { kind: 'parse-failed' })
  }
  const statement = extractStatement(pages)
  return {
    account,
    transactions: extractTransactions(pages),
    ...(statement && { statement }),
  }
}

// ── Statement summary extraction ────────────────────────

/**
 * Best-effort statement period + closing balance. A wallet balance is an
 * asset, so `closingBalance` is stored positive. Missing figures are left
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
      const match = WALLET_PERIOD.exec(line)
      if (match) return { start: parseLongDate(match[1]), end: parseLongDate(match[2]) }
    }
  }
  return undefined
}

/** The closing balance follows the `Closing Balance` label and its date line. */
function extractClosingBalance(pages: Pages): number | undefined {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (!CLOSING_LABEL.test(page[i].trim())) continue
      for (let j = i + 1; j < Math.min(i + 4, page.length); j++) {
        const match = RS_AMOUNT.exec(page[j])
        if (match?.[1]) return parseAmountToMinor(match[1], CURRENCY, 1)
      }
    }
  }
  return undefined
}

// ── Metadata extraction ─────────────────────────────────

function extractAccountDetails(pages: Pages): AdapterResult['account'] {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      const phoneMatch = PHONE_NUMBER.exec(page[i])
      if (!phoneMatch) continue
      const accountNumber = phoneMatch[1].replaceAll(/[^0-9]/g, '')
      const holderName =
        i > 0 && HOLDER_NAME.test(page[i - 1].trim()) ? page[i - 1].trim() : undefined
      return {
        currency: CURRENCY,
        accountNumber: [accountNumber],
        ...(holderName && { accountHolderName: [holderName] }),
      }
    }
  }
  return { currency: CURRENCY }
}

// ── Transaction extraction ──────────────────────────────

function extractTransactions(pages: Pages): TransactionDetails[] {
  return parseTransactions(removeHeaderAndFooterLines(pages))
}

function removeHeaderAndFooterLines(pages: Pages): string[] {
  const result: string[] = []
  for (const page of pages) {
    for (const line of page) {
      if (SKIP_HEADER.some((r) => r.test(line))) continue
      if (SKIP_AFTER.some((r) => r.test(line))) break
      if (line.trim() === '') continue
      result.push(line)
    }
  }
  return result
}

function parseTransactions(lines: string[]): TransactionDetails[] {
  const transactions: TransactionDetails[] = []
  let i = 0

  while (i < lines.length) {
    const timeMatch = TIME_REGEX.exec(lines[i])
    if (!timeMatch) { i++; continue }
    const timeLine = lines[i]
    i++
    if (i >= lines.length) break

    // ── Combined format ───────────────────────────────
    const cm = COMBINED.exec(lines[i])
    if (cm) {
      const sign: 1 | -1 = cm[1] === '-' ? -1 : 1
      const date = parseDateTimeAmPm(cm[4], timeLine) + transactions.length
      let desc = cm[3].trim().replace(/\s+/g, ' ')
      for (const r of SKIP_DESCRIPTION) desc = desc.replace(r, '').trim()
      transactions.push({
        date,
        amount: parseAmountToMinor(cm[2], CURRENCY, sign),
        description: desc,
      })
      i++
      if (i < lines.length && /Transaction ID/i.test(lines[i])) i++
      if (i < lines.length && /^Note:/i.test(lines[i])) i++
      continue
    }

    // ── Separated format ──────────────────────────────
    const am = AMOUNT_ONLY.exec(lines[i])
    if (!am) { i++; continue }
    const sign: 1 | -1 = am[1] === '-' ? -1 : 1
    const amountText = am[2]
    i++

    const descParts: string[] = []
    let dateLine: string | null = null
    while (i < lines.length) {
      if (TIME_REGEX.test(lines[i])) break
      const dateMatch = INLINE_DATE.exec(lines[i])
      if (dateMatch && !dateLine) {
        dateLine = dateMatch[1]
        const before = lines[i].substring(0, dateMatch.index).trim()
        if (before) descParts.push(before)
      } else {
        descParts.push(lines[i])
      }
      i++
    }
    if (!dateLine) continue

    const date = parseDateTimeAmPm(dateLine, timeLine) + transactions.length
    let desc = descParts.join(' ').replace(/\s+/g, ' ').trim()
    desc = desc.replace(RS_BALANCE, '').trim()
    for (const r of SKIP_DESCRIPTION) desc = desc.replace(r, '').trim()

    transactions.push({
      date,
      amount: parseAmountToMinor(amountText, CURRENCY, sign),
      description: desc,
    })
  }

  return transactions
}
