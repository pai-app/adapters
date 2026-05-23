/**
 * Federal Bank — Credit Card PDF statement adapter.
 *
 * Ported from fin-old `FederalBankPdfAdapter`. Logic preserved; adapted to
 * the new type contracts (`FileAdapter`, `AdapterResult`, minor-unit amounts,
 * UTC dates).
 */

import type { FileAdapter, AdapterResult, TransactionDetails, PdfFile } from '@/types'
import { ParseError } from '@/types'
import { parseDate } from '@/util/date'
import { parseAmountToMinor } from '@/util/amount'
import { INDIAN_AMOUNT_G, DATE_DASH_G } from '@/util/regex'

const CURRENCY = 'INR'

// ── Identification ──────────────────────────────────────

const FEDERAL_EMAIL = /@federalbank\.co\.in/i
const FINTECH = /Fintech Partnerships/i

// ── Account ─────────────────────────────────────────────

const CARD_LABEL = /Credit[\s]+Card[\s]+Number/i
const CARD_NUMBER = /([\dX]{16})/

// ── Holder name ─────────────────────────────────────────

const HOLDER_LABEL = /Name and Address of the Customer/i
const HOLDER_NAME = /^([A-Z][A-Z\s]+[A-Z])$/

// ── Transactions ────────────────────────────────────────

// Lines matching: date at start, Cr/Dr at end
const TX_LINE = /^\d{1,2}-\d{1,2}-\d{2,4}.+[CrD|]$/

type Pages = readonly (readonly string[])[]

export const federalCreditPdfAdapter: FileAdapter = {
  fileKind: 'pdf',

  isSupported(file) {
    const pdf = file as PdfFile
    const hasBank = pdf.pages.some((p) => p.some((l) => FEDERAL_EMAIL.test(l)))
    const hasFintech = pdf.pages.some((p) => p.some((l) => FINTECH.test(l)))
    return hasBank && !hasFintech
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(file) {
    const pdf = file as PdfFile
    return readFederalCreditPdf(pdf.pages)
  },
}

function readFederalCreditPdf(pages: Pages): AdapterResult {
  const cardNumber = extractCardNumber(pages)
  if (!cardNumber) {
    throw new ParseError('Unable to extract card number from Federal Bank PDF', { kind: 'parse-failed' })
  }
  const holderName = extractHolderName(pages)
  const transactions = extractTransactions(pages)

  return {
    account: {
      currency: CURRENCY,
      accountNumber: [cardNumber],
      ...(holderName && { accountHolderName: [holderName] }),
    },
    transactions,
  }
}

// ── Metadata extraction ─────────────────────────────────

function extractCardNumber(pages: Pages): string | null {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (!CARD_LABEL.test(page[i])) continue
      for (let j = i; j < Math.min(i + 6, page.length); j++) {
        const match = CARD_NUMBER.exec(page[j])
        if (match) return match[1]
      }
    }
  }
  // Fallback: any line with a 16-char card number
  for (const page of pages) {
    for (const line of page) {
      const match = CARD_NUMBER.exec(line)
      if (match) return match[1]
    }
  }
  return null
}

function extractHolderName(pages: Pages): string | null {
  for (const page of pages) {
    for (let i = 0; i < page.length - 1; i++) {
      if (!HOLDER_LABEL.test(page[i])) continue
      for (let j = i + 1; j < Math.min(i + 3, page.length); j++) {
        if (HOLDER_NAME.test(page[j].trim())) return page[j].trim()
      }
    }
  }
  return null
}

// ── Transaction extraction ──────────────────────────────

function extractTransactions(pages: Pages): TransactionDetails[] {
  const lines: string[] = []
  for (const page of pages) {
    for (const line of page) {
      if (TX_LINE.test(line)) lines.push(line)
    }
  }
  return parseTransactionLines(lines)
}

function parseTransactionLines(lines: string[]): TransactionDetails[] {
  const transactions: TransactionDetails[] = []

  for (const rawLine of lines) {
    let line = rawLine

    // Extract dates — first match becomes transaction date; all removed from line
    const dateMatches = [...line.matchAll(DATE_DASH_G)]
    if (dateMatches.length === 0) continue
    let date = 0
    for (let j = dateMatches.length - 1; j >= 0; j--) {
      const dm = dateMatches[j]
      line = line.slice(0, dm.index) + line.slice(dm.index + dm[0].length)
      date = parseDate(dm[0])
    }

    // Extract amounts — first match is transaction amount; all removed from line
    const amountMatches = [...line.matchAll(INDIAN_AMOUNT_G)]
    if (amountMatches.length < 1) continue
    const amountText = amountMatches[0][1]
    for (let j = amountMatches.length - 1; j >= 0; j--) {
      const am = amountMatches[j]
      line = line.slice(0, am.index) + line.slice(am.index + am[0].length)
    }

    // Determine sign from Cr/Dr suffix
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
