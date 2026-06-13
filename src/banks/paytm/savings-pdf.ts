/**
 * Paytm Payments Bank — Savings Account PDF statement adapter.
 *
 * Ported from fin-old `PaytmBankSavingsAccountPdfAdapter`. Logic preserved;
 * adapted to the new type contracts (`FileAdapter`, `AdapterResult`,
 * minor-unit amounts, UTC dates).
 */

import type { FileAdapter, AdapterResult, AccountDetails, TransactionDetails, PdfFile } from '@/types'
import { ParseError } from '@/types'
import { parseAmountToMinor } from '@/util/amount'
import {
  CURRENCY, TIME_REGEX, SKIP_AFTER, SKIP_DESCRIPTION, parseDateTimeAmPm,
} from './shared'

// ── Identification ──────────────────────────────────────

const PPBL = /PPBL/
const ACCOUNT_STMT = /account statement/i

// ── Account details ─────────────────────────────────────

const TABLE_HEADER = /^ACCOUNT[\s]+NUMBER[\s]+ACCOUNT[\s]+TYPE[\s]+IFSC/i
const ACCOUNT_LABEL = /^ACCOUNT[\s]+NUMBER$/i
const ACCOUNT_NUMBER = /(\d{9,})/

// Holder name: proper-case full name after the GSTIN line on page 1
const GSTIN_LINE = /^GSTIN/i
const HOLDER_NAME = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/

// ── Transactions ────────────────────────────────────────

const DATE_LINE = /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i
// Amount line: sign + amount + balance. E.g. "+   Rs.5,000.00   Rs.6,105.40"
const AMOUNT_LINE = /^([+-])\s*(?:Rs\.|₹)\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)\s+(?:Rs\.|₹)\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)$/
const HEADER_LINE = /^DATE[\s]+&[\s]+TIME[\s]+TRANSACTION[\s]+DETAILS/i

type Pages = readonly (readonly string[])[]

export const paytmSavingsPdfAdapter: FileAdapter = {
  fileKind: 'pdf',

  isSupported(file) {
    const pdf = file as PdfFile
    return (
      pdf.pages.some((p) => p.some((l) => PPBL.test(l))) &&
      pdf.pages.some((p) => p.some((l) => ACCOUNT_STMT.test(l)))
    )
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(file) {
    const pdf = file as PdfFile
    return readPaytmSavingsPdf(pdf.pages)
  },
}

function readPaytmSavingsPdf(pages: Pages): AdapterResult {
  const account = extractAccountDetails(pages)
  if (!account.accountNumber?.[0]) {
    throw new ParseError('Unable to extract account from Paytm savings PDF', { kind: 'parse-failed' })
  }
  const holderName = extractHolderName(pages)
  const transactions = extractTransactions(pages)

  return {
    account: {
      ...account,
      ...(holderName && { accountHolderName: [holderName] }),
    },
    transactions,
  }
}

// ── Metadata extraction ─────────────────────────────────

function extractHolderName(pages: Pages): string | null {
  /* v8 ignore next -- callers only reach here with non-empty pages (account extraction throws first otherwise) */
  if (pages.length === 0) return null
  const page = pages[0]
  for (let i = 0; i < page.length - 1; i++) {
    if (!GSTIN_LINE.test(page[i])) continue
    for (let j = i + 1; j < Math.min(i + 3, page.length); j++) {
      if (HOLDER_NAME.test(page[j].trim())) return page[j].trim()
    }
  }
  return null
}

function extractAccountDetails(pages: Pages): AccountDetails {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      // Table format: "ACCOUNT NUMBER   ACCOUNT TYPE   IFSC   MICR..."
      // Columns may be separated by a single space or several, depending on the
      // PDF text extractor, so split on any run of whitespace.
      if (TABLE_HEADER.test(page[i]) && i + 1 < page.length) {
        const parts = page[i + 1].split(/\s+/)
        if (parts.length >= 4) {
          const acctMatch = ACCOUNT_NUMBER.exec(parts[0])
          return {
            currency: CURRENCY,
            accountNumber: acctMatch ? [acctMatch[1]] : [],
            // parts[2] is always present and non-empty when parts.length >= 4
            // (split never yields an empty interior segment).
            /* v8 ignore next */
            ifscCode: parts[2] ? [parts[2]] : [],
            micrCode: parts[3] ? [parts[3]] : [],
          }
        }
      }

      // Vertical format: "ACCOUNT NUMBER" then value on next line
      if (ACCOUNT_LABEL.test(page[i]) && i + 1 < page.length) {
        const match = page[i + 1].match(ACCOUNT_NUMBER)
        if (!match) continue
        let ifscCode: string | undefined
        let micrCode: string | undefined
        for (let j = i + 2; j < Math.min(i + 12, page.length); j++) {
          if (/^IFSC$/i.test(page[j]) && j + 1 < page.length) ifscCode = page[j + 1]
          if (/^MICR$/i.test(page[j]) && j + 1 < page.length) micrCode = page[j + 1]
        }
        return {
          currency: CURRENCY,
          accountNumber: [match[1]],
          ...(ifscCode && { ifscCode: [ifscCode] }),
          ...(micrCode && { micrCode: [micrCode] }),
        }
      }
    }
  }
  return { currency: CURRENCY }
}

// ── Transaction extraction ──────────────────────────────

function extractTransactions(pages: Pages): TransactionDetails[] {
  const lines = removeHeaderAndFooterLines(pages)
  return parseTransactions(lines)
}

function removeHeaderAndFooterLines(pages: Pages): string[] {
  const result: string[] = []
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      while (i < page.length && HEADER_LINE.test(page[i])) i++
      if (i >= page.length) break
      const line = page[i]
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
    if (!DATE_LINE.test(lines[i])) { i++; continue }
    const dateLine = lines[i]
    i++
    if (i >= lines.length) break

    const timeMatch = TIME_REGEX.exec(lines[i])
    if (!timeMatch) continue
    const timeLine = lines[i]
    i++

    const date = parseDateTimeAmPm(dateLine, timeLine) + transactions.length

    // Collect description lines until amount line
    const descParts: string[] = []
    let amountLine: string | null = null
    while (i < lines.length) {
      if (AMOUNT_LINE.test(lines[i])) {
        amountLine = lines[i]
        i++
        break
      }
      if (DATE_LINE.test(lines[i])) break
      descParts.push(lines[i])
      i++
    }
    if (!amountLine) continue

    const parsed = AMOUNT_LINE.exec(amountLine)
    // Unreachable: `amountLine` was only set after `AMOUNT_LINE.test` matched, so
    // re-running the same regex always parses.
    /* v8 ignore next */
    if (!parsed) continue
    const sign: 1 | -1 = parsed[1] === '-' ? -1 : 1

    // Optional extra description line after amount
    if (i < lines.length && !DATE_LINE.test(lines[i]) && !AMOUNT_LINE.test(lines[i])) {
      descParts.push(lines[i])
      i++
    }

    let desc = descParts.join(' ').replace(/\s+/g, ' ').trim()
    for (const r of SKIP_DESCRIPTION) desc = desc.replace(r, '').trim()

    transactions.push({
      date,
      amount: parseAmountToMinor(parsed[2], CURRENCY, sign),
      description: desc,
    })
  }

  return transactions
}
