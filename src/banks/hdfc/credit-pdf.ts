/**
 * HDFC Bank — Credit Card PDF statement adapter.
 *
 * Ported from fin-old `HdfcCreditCardPdfAdapter`. Logic preserved; adapted to
 * the new type contracts (`FileAdapter`, `AdapterResult`, minor-unit amounts).
 */

import type { FileAdapter, AdapterResult, TransactionDetails, PdfFile } from '@/types'
import { ParseError } from '@/types'
import { parseDateTime } from '@/util/date'
import { parseAmountToMinor } from '@/util/amount'

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

  return {
    account: {
      currency: CURRENCY,
      accountNumber: [accountNumber],
      ...(holderName && { accountHolderName: [holderName] }),
      ...(altAccount && { customerId: [altAccount] }),
    },
    transactions,
  }
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
