/**
 * SBI — Loan "Account Statement" adapter for the retail net-banking export
 * (e.g. a loan final/closure statement), distinct from the quarterly EMI
 * "STATEMENT OF ACCOUNT" handled by `loan-pdf`.
 *
 * Layout quirks: `DD Mon YYYY` dates, rows in reverse-chronological order,
 * signed balances (outstanding is negative, no `DR` suffix), and no account
 * IFSC/MICR. Transaction sign is derived from balance movement — a rise toward
 * zero is a repayment (credit `+`), a fall is an interest/charge (debit `−`).
 */

import type { FileAdapter, AdapterResult, TransactionDetails, PdfFile, StatementSummary, AccountDetails } from '@/types'
import { ParseError } from '@/types'
import { parseDate } from '@/util/date'
import { parseAmountToMinor } from '@/util/amount'

const CURRENCY = 'INR'
const DATE = String.raw`\d{1,2}\s+[A-Za-z]{3}\s+\d{4}`
const MONEY = /-?[\d,]+\.\d{2}/g
// A record starts with a txn-date + value-date pair; its body (description,
// ref, debit/credit placeholders, amount, balance) runs until the next pair.
const RECORD = new RegExp(`(${DATE})\\s+(?:${DATE})\\s+(.+?)(?=(?:${DATE})\\s+(?:${DATE})|$)`, 'g')

type Pages = readonly (readonly string[])[]
type Row = { readonly dateStr: string; readonly desc: string; readonly amount: string; readonly balance: number }

export const sbiLoanAccountStatementPdfAdapter: FileAdapter = {
  fileKind: 'pdf',

  isSupported(file) {
    const j = (file as PdfFile).pages.map((p) => p.join(' ')).join(' ')
    return (
      /SBIN/i.test(j) &&
      /Account Statement from/i.test(j) &&
      /Txn Date/i.test(j) &&
      /Account Description\s*:\s*[^:]*LOAN/i.test(j)
    )
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(file) {
    return readAccountStatement((file as PdfFile).pages)
  },
}

function readAccountStatement(pages: Pages): AdapterResult {
  const joined = pages.map((p) => p.join(' ')).join(' ')
  const account = extractAccount(joined)
  if (!account.accountNumber) {
    throw new ParseError('Unable to extract account number from SBI account statement', { kind: 'parse-failed' })
  }
  const rows = parseRows(joined)
  const transactions = signRows(rows, extractOpening(joined))
  const statement = extractStatement(joined, rows)
  return { account, transactions, ...(statement && { statement }) }
}

// ── Account details ─────────────────────────────────────

function extractAccount(joined: string): AccountDetails {
  const account = /Account Number\s*:\s*0*(\d+)/i.exec(joined)?.[1]
  const holder = /Account Name\s*:\s*(?:Mr|Mrs|Ms)\.?\s*(.+?)\s+Address\b/i.exec(joined)?.[1]?.trim()
  return {
    currency: CURRENCY,
    ...(account && { accountNumber: [account] }),
    ...(holder && { accountHolderName: [holder] }),
  }
}

function extractOpening(joined: string): number {
  const m = /Balance as on .+? :\s*(-?[\d,]+\.\d{2})/i.exec(joined)
  return m ? toMajor(m[1]) : 0
}

// ── Transactions ────────────────────────────────────────

/** Rows in the statement's own (reverse-chronological) order. */
function parseRows(joined: string): Row[] {
  const body = joined.split(/Debit\s+Credit\s+Balance/i)[1] ?? ''
  const rows: Row[] = []
  for (const m of body.matchAll(RECORD)) {
    const [, dateStr, rest] = m
    const monies = rest.match(MONEY) ?? []
    if (monies.length < 2) continue
    const amount = monies[monies.length - 2]
    const balance = toMajor(monies[monies.length - 1])
    const desc = rest
      .replace(/(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s*$/, '')
      .replace(/\s+/g, ' ')
      .replace(/[\s-]+$/, '')
      .trim()
    rows.push({ dateStr, desc, amount, balance })
  }
  return rows
}

/**
 * Convert reverse-chronological rows into chronological, signed transactions.
 * A balance that rises toward zero is a repayment (credit `+`); a fall is an
 * interest/charge (debit `−`).
 */
function signRows(rows: readonly Row[], opening: number): TransactionDetails[] {
  const chrono = rows.slice().reverse()
  let prev = opening
  return chrono.map((r, i) => {
    const sign: 1 | -1 = r.balance > prev ? 1 : -1
    prev = r.balance
    return { date: parseDate(r.dateStr) + i, description: r.desc, amount: parseAmountToMinor(r.amount, CURRENCY, sign) }
  })
}

// ── Statement summary ───────────────────────────────────

/** Period + closing balance. Loan outstanding is a liability, so it stays signed (negative). */
function extractStatement(joined: string, rows: readonly Row[]): StatementSummary | undefined {
  const period = new RegExp(`Account Statement from (${DATE}) to (${DATE})`, 'i').exec(joined)
  const closing = rows.length > 0 ? rows[0].balance : undefined // rows[0] = newest
  const summary: StatementSummary = {
    ...(period && { periodStart: parseDate(period[1]), periodEnd: parseDate(period[2]), asOf: parseDate(period[2]) }),
    ...(closing !== undefined && { closingBalance: toMinor(closing) }),
  }
  return Object.keys(summary).length > 0 ? summary : undefined
}

// ── Helpers ─────────────────────────────────────────────

/** Parse a signed rupee display value (`-8,28,466.00`) to major units. */
function toMajor(text: string): number {
  return parseFloat(text.replace(/,/g, ''))
}

/** Signed minor units from a signed major value. */
function toMinor(major: number): number {
  return Math.round(major * 100)
}
