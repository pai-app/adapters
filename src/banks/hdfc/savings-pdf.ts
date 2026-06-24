/**
 * HDFC Bank — Savings Account PDF statement adapter.
 *
 * Ported from fin-old `HdfcBankPdfAdapter`. Logic preserved; adapted to
 * the new type contracts (`FileAdapter`, `AdapterResult`, minor-unit amounts).
 */

import type { FileAdapter, AdapterResult, TransactionDetails, PdfFile, StatementSummary } from '@/types'
import { ParseError } from '@/types'
import { parseDate } from '@/util/date'
import { parseAmountFloat, parseAmountToMinor } from '@/util/amount'
import { INDIAN_AMOUNT, INDIAN_AMOUNT_G, DATE_SLASH_START, REFERENCE_NUMBER } from '@/util/regex'
import { HDFC_IFSC_REGEX, HDFC_IFSC_LABEL_REGEX } from './shared'

const CURRENCY = 'INR'

const ACCOUNT_NUMBER_LABEL = /Account[\s]+Number|Account[\s]+No/i
const ACCOUNT_NUMBER_DIGITS = /(\d{10,})/
const OPENING_BALANCE_LABEL = /Opening[\s]+Balance/i
// Statement period: "Statement ... From : 01/04/2026 To : 30/04/2026" on one
// line (year may be 2- or 4-digit across statement eras).
const STATEMENT_PERIOD = /From\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+To\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i
// Closing balance lives in the trailing STATEMENT SUMMARY block, in one of two
// layouts: a tabular header row naming both opening & closing balances followed
// by a value row (closing = last amount), or a standalone "Closing Balance"
// label with the value on the next line. The transaction column header also
// contains "Closing Balance", so neither anchor may match a bare column header.
const OPENING_BAL_TEXT = /Opening[\s]*Balance/i
const CLOSING_BAL_TEXT = /Closing[\s]*Bal/i
const CLOSING_BAL_LABEL = /^Closing[\s]*Balance\*?$/i
// Combined-statement summary amounts are glued with no separators
// ("12,65,803.002,50,003.00…"); match each as an exact-2-decimal Indian amount
// so the run splits cleanly (the shared INDIAN_AMOUNT's greedy `.\d+` does not).
const SUMMARY_AMOUNT_G = /\d{1,3}(?:,\d{2,3})*\.\d{2}/g
// Period without a "From" prefix, e.g. the combined layout's ": 01/04/2024 To 30/04/2024".
const PERIOD_TO = /(\d{1,2}\/\d{1,2}\/\d{2,4})\s+To\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i
const HOLDER_NAME = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/
// Header block style: colon-prefixed value on its own line
const CUSTOMER_ID_VALUE = /^:\s*(\d{7,9})$/
const ACCOUNT_NUMBER_VALUE = /^:\s*(\d{14,16})$/
const IFSC_MICR_VALUE = /^:\s*(HDFC0\w+)\s+:\s*(\d{9})$/i
// Footer block style: "Label : Value" on a single line
const CUSTOMER_ID_INLINE = /Cust[\s]+ID[\s]*:[\s]*(\d{7,9})/i
const HOLDER_NAME_INLINE = /^(?:MR\.|MRS\.|MS\.)\s+(.+)$/i
const IFSC_INLINE = /IFSC[\s]*:[\s]*(HDFC0\w+)/i
const MICR_INLINE = /MICR[\s]*:[\s]*(\d{9})/i

const SKIP_LINES_AFTER = [
  /^Page/i,
  /^STATEMENT[\s]+SUMMARY/i,
  /^Cr[\s]+Count/i,
  /^\*{2,}/i,
]

type Pages = readonly (readonly string[])[]

export const hdfcSavingsPdfAdapter: FileAdapter = {
  fileKind: 'pdf',

  isSupported(file) {
    const pdf = file as PdfFile
    return pdf.pages.some((page) => {
      const joined = page.join(' ')
      return HDFC_IFSC_REGEX.test(joined) && HDFC_IFSC_LABEL_REGEX.test(joined)
    })
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(file) {
    const pdf = file as PdfFile
    return readHdfcSavingsPdf(pdf.pages)
  },
}

function readHdfcSavingsPdf(pages: Pages): AdapterResult {
  const accountNumber = extractAccountNumber(pages)
  if (!accountNumber) {
    throw new ParseError('Unable to extract account number from HDFC savings PDF', { kind: 'parse-failed' })
  }

  const holderName = extractHolderName(pages)
  const customerId = extractCustomerId(pages)
  const ifscCode = extractIfscCode(pages)
  const micrCode = extractMicrCode(pages)
  const transactions = extractTransactions(pages)
  const statement = extractStatement(pages)

  return {
    account: {
      currency: CURRENCY,
      accountNumber: [accountNumber],
      ...(holderName && { accountHolderName: [holderName] }),
      ...(customerId && { customerId: [customerId] }),
      ...(ifscCode && { ifscCode: [ifscCode] }),
      ...(micrCode && { micrCode: [micrCode] }),
    },
    transactions,
    ...(statement && { statement }),
  }
}

// ── Statement summary extraction ────────────────────────

/**
 * Best-effort extraction of the statement period and closing balance. A savings
 * balance is an asset, so `closingBalance` is stored positive. Any figure that
 * cannot be found is left `undefined` — a missing figure never fails the parse.
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
      const match = STATEMENT_PERIOD.exec(line) ?? PERIOD_TO.exec(line)
      if (match) return { start: parseDate(match[1]), end: parseDate(match[2]) }
    }
  }
  return undefined
}

function extractClosingBalance(pages: Pages): number | undefined {
  // Summary header naming BOTH opening and closing balances. Column order and
  // value-row position vary by statement era:
  //  - classic:   "Opening Balance … Closing Bal" (closing last), values BELOW
  //  - combined:  "Closing Balance…Opening Balance" (closing first), values ABOVE
  // The transaction column header names "Closing Balance" but not "Opening", so
  // the dual test excludes it. Pick the closing amount by the header's column
  // order; combined-layout value rows are glued, so split with SUMMARY_AMOUNT_G.
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      const header = page[i]
      if (!OPENING_BAL_TEXT.test(header) || !CLOSING_BAL_TEXT.test(header)) continue
      const closingFirst = header.search(/Closing/i) < header.search(/Opening/i)
      for (const j of [i + 1, i + 2, i - 1]) {
        if (j < 0 || j >= page.length) continue
        const amounts = page[j].match(SUMMARY_AMOUNT_G)
        if (amounts && amounts.length >= 2) {
          const pick = closingFirst ? amounts[0] : amounts[amounts.length - 1]
          return parseAmountToMinor(pick, CURRENCY, 1)
        }
      }
    }
  }
  // Stacked summary: a standalone "Closing Balance" label with the value below.
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (!CLOSING_BAL_LABEL.test(page[i].trim())) continue
      for (let j = i + 1; j < Math.min(i + 3, page.length); j++) {
        const match = INDIAN_AMOUNT.exec(page[j])
        if (match?.[1]) return parseAmountToMinor(match[1], CURRENCY, 1)
      }
    }
  }
  return undefined
}

// ── Metadata extraction ─────────────────────────────────

function extractAccountNumber(pages: Pages): string | null {
  for (const page of pages) {
    for (const line of page) {
      const match = ACCOUNT_NUMBER_VALUE.exec(line.trim())
      if (match?.[1]) return match[1]
    }
  }
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (ACCOUNT_NUMBER_LABEL.test(page[i])) {
        while (!ACCOUNT_NUMBER_DIGITS.test(page[i]) && i < page.length - 1) i++
        const match = ACCOUNT_NUMBER_DIGITS.exec(page[i])
        if (match?.[1]) return match[1]
      }
    }
  }
  return null
}

function extractHolderName(pages: Pages): string | null {
  // Header style: Proper Case name as first line of page 2+
  for (let p = 1; p < pages.length; p++) {
    const first = pages[p][0]?.trim()
    if (first && HOLDER_NAME.test(first)) return first
  }
  // Footer style: "MR. ABHAY JATIN DOSHI"
  for (const page of pages) {
    for (const line of page) {
      const match = HOLDER_NAME_INLINE.exec(line.trim())
      if (match?.[1]) return match[1]
    }
  }
  return null
}

function extractCustomerId(pages: Pages): string | null {
  // Header style: ": 74317558" on its own line
  for (const page of pages) {
    for (const line of page) {
      const match = CUSTOMER_ID_VALUE.exec(line.trim())
      if (match?.[1]) return match[1]
    }
  }
  // Footer style: "Cust ID : 74317558"
  for (const page of pages) {
    for (const line of page) {
      const match = CUSTOMER_ID_INLINE.exec(line.trim())
      if (match?.[1]) return match[1]
    }
  }
  return null
}

function extractIfscCode(pages: Pages): string | null {
  // Header style: ": HDFC0001073   : 600240051"
  for (const page of pages) {
    for (const line of page) {
      const match = IFSC_MICR_VALUE.exec(line.trim())
      if (match?.[1]) return match[1].toUpperCase()
    }
  }
  // Footer style: "RTGS/NEFT IFSC: HDFC0001073"
  for (const page of pages) {
    for (const line of page) {
      const match = IFSC_INLINE.exec(line.trim())
      if (match?.[1]) return match[1].toUpperCase()
    }
  }
  return null
}

function extractMicrCode(pages: Pages): string | null {
  // Header style
  for (const page of pages) {
    for (const line of page) {
      const match = IFSC_MICR_VALUE.exec(line.trim())
      if (match?.[2]) return match[2]
    }
  }
  // Footer style: "MICR : 600240051"
  for (const page of pages) {
    for (const line of page) {
      const match = MICR_INLINE.exec(line.trim())
      if (match?.[1]) return match[1]
    }
  }
  return null
}

// ── Transaction extraction ──────────────────────────────

function extractOpeningBalance(pages: Pages): number | null {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      if (!OPENING_BALANCE_LABEL.test(page[i])) continue
      while (i < page.length - 1) {
        const matches = [...page[i].matchAll(INDIAN_AMOUNT_G)].map((m) => m[1])
        if (matches.length > 0) {
          return parseAmountFloat(matches[0])
        }
        i++
      }
    }
  }
  return null
}

function removeHeaderAndFooter(pages: Pages): string[] {
  const out: string[] = []
  for (const page of pages) {
    const headerIdx = page.findIndex((line) => DATE_SLASH_START.test(line))
    // Unreachable: callers only pass pages already filtered to contain a date
    // line, so `findIndex` never returns -1 here.
    /* v8 ignore next */
    if (headerIdx === -1) continue
    let footerIdx = page.length
    for (let i = headerIdx; i < footerIdx; i++) {
      if (SKIP_LINES_AFTER.some((re) => re.test(page[i]))) {
        footerIdx = i
        break
      }
    }
    out.push(...page.slice(headerIdx, footerIdx))
  }
  return out
}

function extractTransactions(pages: Pages): TransactionDetails[] {
  const openingBalance = extractOpeningBalance(pages)
  if (openingBalance === null) {
    throw new ParseError('Could not find opening balance in HDFC savings PDF', { kind: 'parse-failed' })
  }

  const filteredPages = pages.filter((page) =>
    page.some((line) => DATE_SLASH_START.test(line)),
  )
  const lines = removeHeaderAndFooter(filteredPages)
  return parseTransactionLines(lines, openingBalance)
}

function parseTransactionLines(lines: string[], openingBalance: number): TransactionDetails[] {
  const transactions: TransactionDetails[] = []
  let currentBalance = openingBalance

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    const dateMatch = DATE_SLASH_START.exec(line)
    if (!dateMatch?.[1]) continue

    // Merge continuation lines until we find ≥2 amounts and the next line is a new date or EOF
    let merged = ''
    let found = false
    const scanLimit = Math.min(10, lines.length - i)
    for (let j = 0; j < scanLimit; j++) {
      merged += lines[i + j] + ' '
      if ([...merged.matchAll(INDIAN_AMOUNT_G)].length >= 2) {
        if (i + j === lines.length - 1 || DATE_SLASH_START.test(lines[i + j + 1])) {
          i += j
          line = merged
          found = true
          break
        }
      }
    }
    if (!found) continue

    const dateStr = dateMatch[1]
    line = line.slice(dateStr.length)
    const date = parseDate(dateStr) + transactions.length // preserve order within same day

    const amountMatches = [...line.matchAll(INDIAN_AMOUNT_G)]
    // Unreachable: the merge step above already guaranteed >= 2 amounts and only
    // the leading date token is sliced off, so the count never drops below 2.
    /* v8 ignore next */
    if (amountMatches.length < 2) continue

    // Remove amount strings to isolate description
    let desc = line
    for (let j = amountMatches.length - 1; j >= 0; j--) {
      const m = amountMatches[j]
      desc = desc.slice(0, m.index) + desc.slice(m.index + m[0].length)
    }

    const balanceStr = amountMatches[amountMatches.length - 1][1]
    const balance = parseAmountFloat(balanceStr)

    let rawAmount = 0
    for (const m of amountMatches.slice(0, amountMatches.length - 1)) {
      rawAmount = parseAmountFloat(m[1])
      if (rawAmount !== 0) break
    }

    // Unreachable: `parseAmountFloat` throws on non-numeric input, so the
    // values here are always valid numbers rather than NaN.
    /* v8 ignore next */
    if (Number.isNaN(balance) || Number.isNaN(rawAmount)) continue

    const sign: 1 | -1 = balance < currentBalance ? -1 : 1

    // Extract reference number and value date from description
    if (!/Value[\s]+Dt/.test(desc)) {
      const firstAmountIdx = amountMatches[0].index
      let parts = desc.slice(0, firstAmountIdx).split(' ').filter((p) => p.trim() !== '')
      let suffix = ''

      const valueDateIdx = parts.findIndex((p) => DATE_SLASH_START.test(p))
      if (valueDateIdx !== -1) {
        const vd = new Date(parseDate(parts[valueDateIdx]))
        parts = [...parts.slice(0, valueDateIdx), ...parts.slice(valueDateIdx + 1)]
        suffix += ` Value Dt ${String(vd.getUTCDate()).padStart(2, '0')}/${String(vd.getUTCMonth() + 1).padStart(2, '0')}/${String(vd.getUTCFullYear())}`
      }

      let refIdx = findLastIndex(parts, (p) => REFERENCE_NUMBER.test(p))
      if (refIdx === -1) {
        refIdx = findLastIndex(parts, (p) => /^[0-9]{4,}$/.test(p))
      }
      if (refIdx !== -1) {
        /* v8 ignore next -- refIdx is a valid index from findLastIndex, so parts[refIdx] is always defined */
        const ref = parts[refIdx] ?? ''
        parts = [...parts.slice(0, refIdx), ...parts.slice(refIdx + 1)]
        if (/^[0-9]+$/.test(ref) && parseInt(ref) > 0) {
          suffix += ` Ref ${ref.replace(/^0+/, '')}`
        }
      }

      desc = parts.join(' ') + ' ' + desc.slice(firstAmountIdx) + suffix
    }

    currentBalance = balance
    desc = desc.replace(/\s+/g, ' ').trim()

    transactions.push({
      date,
      amount: parseAmountToMinor(String(rawAmount), CURRENCY, sign),
      description: desc,
    })
  }

  return transactions
}

/** Array.findLastIndex polyfill with proper typing for strict mode. */
function findLastIndex<T>(arr: readonly T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i
  }
  return -1
}
