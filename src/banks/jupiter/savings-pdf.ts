/**
 * Jupiter (Federal Bank Fintech) — Savings/UPI Account PDF statement adapter.
 *
 * Ported from fin-old `JupiterPdfAdapter`. Logic preserved; adapted to
 * the new type contracts (`FileAdapter`, `AdapterResult`, minor-unit amounts,
 * UTC dates).
 *
 * Jupiter uses Federal Bank as its banking partner. Statements are distinguished
 * from Federal Bank's own by the presence of "Fintech Partnerships".
 */

import type { FileAdapter, AdapterResult, TransactionDetails, PdfFile } from '@/types'
import { ParseError } from '@/types'
import { parseDate } from '@/util/date'
import { parseAmountToMinor } from '@/util/amount'

const CURRENCY = 'INR'

// ── Identification ──────────────────────────────────────

const JUPITER = /Jupiter/i
const FINTECH = /Fintech Partnerships/

// ── Account metadata ────────────────────────────────────

const ACCOUNT_NUMBER = /Account[\s]+Number[\s]+(\d{10,})/i
const HOLDER_NAME = /^Name\s{2,}(.+?)\s{2,}/i
const CUSTOMER_ID = /Customer[\s]+ID\s{2,}(\d{6,})/i
const IFSC_CODE = /^IFSC\s{2,}([A-Z0-9]{8,11})\b/i
const MICR_CODE = /MICR[\s]+Code\s{2,}(\d{9})/i
const SWIFT_CODE = /SWIFT[\s]+Code\s{2,}([A-Z0-9]{8,11})/i

// ── Transactions ────────────────────────────────────────

const DATE_START = /^\d{1,2}\/\d{1,2}\/\d{2,4}.*/
const DATE_G = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g
const AMOUNT_G = /(\d+\.\d{2})/g
const SKIP_AFTER = [/^Page/i, /^GRAND TOTAL/i]

type Pages = readonly (readonly string[])[]

export const jupiterSavingsPdfAdapter: FileAdapter = {
  fileKind: 'pdf',

  isSupported(file) {
    const pdf = file as PdfFile
    return (
      pdf.pages.some((p) => p.some((l) => JUPITER.test(l))) &&
      pdf.pages.some((p) => p.some((l) => FINTECH.test(l)))
    )
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(file) {
    const pdf = file as PdfFile
    return readJupiterPdf(pdf.pages)
  },
}

function readJupiterPdf(pages: Pages): AdapterResult {
  const accountNumber = extractAccountNumber(pages)
  if (!accountNumber) {
    throw new ParseError('Unable to extract account number from Jupiter PDF', { kind: 'parse-failed' })
  }

  const holderName = extractMatch(pages, HOLDER_NAME)
  const customerId = extractMatch(pages, CUSTOMER_ID)
  const ifscCode = extractMatch(pages, IFSC_CODE)
  const micrCode = extractMatch(pages, MICR_CODE)
  const swiftCode = extractMatch(pages, SWIFT_CODE)
  const transactions = extractTransactions(pages)

  return {
    account: {
      currency: CURRENCY,
      accountNumber: [accountNumber],
      ...(holderName && { accountHolderName: [holderName] }),
      ...(customerId && { customerId: [customerId] }),
      ...(ifscCode && { ifscCode: [ifscCode] }),
      ...(micrCode && { micrCode: [micrCode] }),
      ...(swiftCode && { swiftCode: [swiftCode] }),
    },
    transactions,
  }
}

// ── Metadata extraction ─────────────────────────────────

function extractAccountNumber(pages: Pages): string | null {
  for (const page of pages) {
    for (const line of page) {
      const match = ACCOUNT_NUMBER.exec(line)
      if (match) return match[1]
    }
  }
  return null
}

/** Scan all pages for the first capture group of a regex. */
function extractMatch(pages: Pages, regex: RegExp): string | null {
  for (const page of pages) {
    for (const line of page) {
      const match = regex.exec(line)
      if (match) return match[1].trim()
    }
  }
  return null
}

// ── Transaction extraction ──────────────────────────────

function extractTransactions(pages: Pages): TransactionDetails[] {
  const lines = removeHeaderAndFooterLines(pages)
  return parseTransactionLines(lines)
}

function removeHeaderAndFooterLines(pages: Pages): string[] {
  const result: string[] = []
  for (const page of pages) {
    const start = page.findIndex((l) => DATE_START.test(l))
    if (start === -1) continue
    let end = page.length
    for (let i = start; i < page.length; i++) {
      if (SKIP_AFTER.some((r) => r.test(page[i]))) { end = i; break }
    }
    result.push(...page.slice(start, end))
  }
  return result
}

function parseTransactionLines(lines: string[]): TransactionDetails[] {
  const transactions: TransactionDetails[] = []

  for (let i = 0; i < lines.length; i++) {
    if (!DATE_START.test(lines[i])) continue

    // Merge continuation lines until amounts found + next line is a new date or end
    let merged = ''
    let found = false
    const limit = Math.min(5, lines.length - i)
    for (let j = 0; j < limit; j++) {
      merged += lines[i + j] + ' '
      const amounts = [...merged.matchAll(AMOUNT_G)]
      if (amounts.length >= 1) {
        if (i + j === lines.length - 1 || DATE_START.test(lines[i + j + 1])) {
          i += j
          found = true
          break
        }
      }
    }
    if (!found) continue

    let line = merged

    // Extract dates — first match becomes transaction date; all removed from line
    const dateMatches = [...line.matchAll(DATE_G)]
    let date = 0
    for (let j = dateMatches.length - 1; j >= 0; j--) {
      const dm = dateMatches[j]
      line = line.slice(0, dm.index) + line.slice(dm.index + dm[0].length)
      date = parseDate(dm[0])
    }

    // Need at least 2 amounts: transaction amount + balance
    const amountMatches = [...line.matchAll(AMOUNT_G)]
    if (amountMatches.length < 2) continue
    const amountText = amountMatches[0][1]
    for (let j = amountMatches.length - 1; j >= 0; j--) {
      const am = amountMatches[j]
      line = line.slice(0, am.index) + line.slice(am.index + am[0].length)
    }

    // Clean up and determine sign
    line = line.replace('TFR', '')
    let sign: 1 | -1 = 1
    if (line.includes('Cr')) {
      line = line.replace('Cr', '')
    } else if (line.includes('Dr')) {
      line = line.replace('Dr', '')
      sign = -1
    }

    const description = line.trim().replace(/\s+/g, ' ')
    if (!description) continue

    transactions.push({
      date: date + transactions.length,
      amount: parseAmountToMinor(amountText, CURRENCY, sign),
      description,
    })
  }

  return transactions
}
