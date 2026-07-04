/**
 * SBI — Savings account adapter for the "E-account statement for your SBI
 * account(s)" PDF. That statement is a combined YONO document that may cover
 * several accounts; this adapter reads only the SAVINGS account's
 * TRANSACTION DETAILS section (the loan section is served by `loan-pdf`).
 */

import type { FileAdapter, AdapterResult, TransactionDetails, PdfFile, StatementSummary, AccountDetails } from '@/types'
import { ParseError } from '@/types'
import { parseDate } from '@/util/date'
import { parseAmountToMinor } from '@/util/amount'
import { SBI_IFSC_REGEX, findIfsc } from './shared'

const CURRENCY = 'INR'
// Row: `DD-MM-YY <details+ref> <credit> <debit> <balance>` (credit before
// debit). An empty money column is written as `-` or `0`. Non-greedy details,
// delimited by the next date or end of section.
const TXN_ROW =
  /(\d{2}-\d{2}-\d{2})\s+(.+?)\s+(-|0|[\d,]+\.\d{2})\s+(-|0|[\d,]+\.\d{2})\s+([\d,]+\.\d{2})(?=\s+\d{2}-\d{2}-\d{2}|\s*$)/g
const TXN_HEADER = /Date\s+Transaction\s+Reference/i
const TXN_END = /TRANSACTION OVERVIEW|All dates are in/i

type Pages = readonly (readonly string[])[]

export const sbiSavingsPdfAdapter: FileAdapter = {
  fileKind: 'pdf',

  isSupported(file) {
    const pdf = file as PdfFile
    const joined = pdf.pages.map((p) => p.join(' ')).join(' ')
    return (
      SBI_IFSC_REGEX.test(joined) &&
      /Welcome\s+M(?:r|rs|s)\b/i.test(joined) &&
      /SAVING ACCOUNT/i.test(joined) &&
      !/STATEMENT OF ACCOUNT/i.test(joined)
    )
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(file) {
    return readSbiSavings((file as PdfFile).pages)
  },
}

function readSbiSavings(pages: Pages): AdapterResult {
  const page = findSavingsPage(pages)
  if (!page) {
    throw new ParseError('No SAVINGS account section in SBI e-statement', { kind: 'parse-failed' })
  }
  const account = extractAccount(page)
  const transactions = extractTransactions(pages)
  const statement = extractStatement(page)
  return { account, transactions, ...(statement && { statement }) }
}

/**
 * The TRANSACTION DETAILS page describing the savings account. Keyed on
 * `Name of the Account Holder` (present only on a per-account details page, not
 * on the summary page whose nav header also reads "Transaction Details").
 */
function findSavingsPage(pages: Pages): readonly string[] | undefined {
  return pages.find((p) => {
    const j = p.join(' ')
    return /Name of the Account Holder/i.test(j) && /SAVING ACCOUNT/i.test(j) && !/DL\/TL ACCOUNT/i.test(j)
  })
}

// ── Account details ─────────────────────────────────────

function extractAccount(page: readonly string[]): AccountDetails {
  const joined = page.join(' ')
  const accountNumber = extractAccountNumber(page)
  const holder = extractHolder(page)
  const ifsc = findIfsc(joined)
  const micr = /MICR Code\s+(\d{9})/i.exec(joined)?.[1]
  return {
    currency: CURRENCY,
    ...(accountNumber && { accountNumber: [accountNumber] }),
    ...(holder && { accountHolderName: [holder] }),
    ...(ifsc && { ifscCode: [ifsc] }),
    ...(micr && { micrCode: [micr] }),
  }
}

/** Masked account number on the line after the `SAVING ACCOUNT` label. */
function extractAccountNumber(page: readonly string[]): string | null {
  const idx = page.findIndex((l) => /^SAVING ACCOUNT$/i.test(l.trim()))
  if (idx >= 0 && idx + 1 < page.length) {
    const next = page[idx + 1].trim()
    if (/^[X\d]{6,}$/i.test(next)) return next.toUpperCase()
  }
  return null
}

/** Holder name from its own line (`Name of the Account Holder Mr. …`). */
function extractHolder(page: readonly string[]): string | undefined {
  for (const line of page) {
    const m = /Name of the Account Holder\s+(?:Mr|Mrs|Ms)\.?\s*(.+)$/i.exec(line.trim())
    if (m?.[1]) return m[1].trim()
  }
  return undefined
}

// ── Transactions ────────────────────────────────────────

/**
 * Collect rows from every page that carries the transaction header and belongs
 * to the savings account (not the loan section of a combined statement).
 */
function extractTransactions(pages: Pages): TransactionDetails[] {
  const out: TransactionDetails[] = []
  for (const page of pages) {
    if (!page.some((l) => TXN_HEADER.test(l))) continue
    const j = page.join(' ')
    if (/SAVING ACCOUNT/i.test(j) && !/DL\/TL ACCOUNT/i.test(j)) parsePageRows(page, out)
  }
  return out
}

function parsePageRows(page: readonly string[], out: TransactionDetails[]): void {
  const start = page.findIndex((l) => TXN_HEADER.test(l))
  if (start < 0) return
  const lines: string[] = []
  for (let i = start + 1; i < page.length; i++) {
    if (TXN_END.test(page[i])) break
    if (/^null(?:\s+null)*$/i.test(page[i].trim())) continue
    lines.push(page[i])
  }
  const joined = lines.join(' ')
  for (const m of joined.matchAll(TXN_ROW)) {
    const [, dateStr, descRef, credit, debit] = m
    const hasCredit = credit !== '-' && credit !== '0'
    const amountStr = hasCredit ? credit : debit
    if (amountStr === '-' || amountStr === '0') continue
    const desc = descRef.replace(/\s+[-0]\s*$/, '').replace(/\s+/g, ' ').trim()
    out.push({
      date: parseDate(dateStr) + out.length,
      amount: parseAmountToMinor(amountStr, CURRENCY, hasCredit ? 1 : -1),
      description: desc,
    })
  }
}

// ── Statement summary ───────────────────────────────────

/**
 * Period + closing balance. A savings balance is an asset, so `closingBalance`
 * is positive. Falls back to `Available Balance` / `As on` for zero-activity
 * months that carry no TRANSACTION OVERVIEW block.
 */
function extractStatement(page: readonly string[]): StatementSummary | undefined {
  const j = page.join(' ')
  const close = /Your Closing Balance on (\d{2}-\d{2}-\d{2}):\s*([\d,]+\.\d{2})/i.exec(j)
  const open = /Your Opening Balance on (\d{2}-\d{2}-\d{2}):\s*([\d,]+\.\d{2})/i.exec(j)
  const summary: StatementSummary = {
    ...(open && { periodStart: parseDate(open[1]) }),
    ...(close
      ? { periodEnd: parseDate(close[1]), asOf: parseDate(close[1]), closingBalance: parseAmountToMinor(close[2], CURRENCY, 1) }
      : fallbackClose(j)),
  }
  return Object.keys(summary).length > 0 ? summary : undefined
}

function fallbackClose(joined: string): Partial<StatementSummary> {
  const avail = /Available Balance\s+([\d,]+\.\d{2})/i.exec(joined)
  const asOf = /As on (\d{2}-\d{2}-\d{2})/i.exec(joined)
  return {
    ...(asOf && { asOf: parseDate(asOf[1]), periodEnd: parseDate(asOf[1]) }),
    ...(avail && { closingBalance: parseAmountToMinor(avail[1], CURRENCY, 1) }),
  }
}
