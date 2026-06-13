import { MONTH_NAMES } from './regex'

/**
 * Parse a date string in one of the Indian bank statement formats.
 *
 * Supported formats:
 * - `DD/MM/YY` or `DD/MM/YYYY`
 * - `DD-MM-YY` or `DD-MM-YYYY`
 * - `DD Mon YYYY` (e.g. `15 Jan 2024`)
 *
 * Returns ms-epoch (UTC midnight). Throws on unparseable input.
 */
export function parseDate(text: string): number {
  const trimmed = text.trim()

  // DD/MM/YY or DD/MM/YYYY
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed)
  if (slashMatch) {
    return buildDate(slashMatch[1], slashMatch[2], slashMatch[3])
  }

  // DD-MM-YY or DD-MM-YYYY
  const dashMatch = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/.exec(trimmed)
  if (dashMatch) {
    return buildDate(dashMatch[1], dashMatch[2], dashMatch[3])
  }

  // DD Mon YYYY or DD Mon YY (e.g. "15 Jan 2024", "27 Feb 24")
  const monthMatch = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})$/.exec(trimmed)
  if (monthMatch) {
    const day = parseInt(monthMatch[1], 10)
    const monthIdx = MONTH_NAMES.indexOf(monthMatch[2].toLowerCase())
    if (monthIdx < 0) throw new Error(`Unknown month: ${monthMatch[2]}`)
    const year = normalizeYear(parseInt(monthMatch[3], 10))
    return Date.UTC(year, monthIdx, day)
  }

  throw new Error(`Unparseable date: "${trimmed}"`)
}

/**
 * Parse a date+time string. Falls back to `parseDate` if no time component.
 * Supports `DD/MM/YYYY HH:mm:ss`.
 */
export function parseDateTime(text: string): number {
  const trimmed = text.trim()

  const dtMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(trimmed)
  if (dtMatch) {
    const year = normalizeYear(parseInt(dtMatch[3], 10))
    const month = parseInt(dtMatch[2], 10) - 1
    const day = parseInt(dtMatch[1], 10)
    const hour = parseInt(dtMatch[4], 10)
    const minute = parseInt(dtMatch[5], 10)
    const second = parseInt(dtMatch[6], 10)
    return Date.UTC(year, month, day, hour, minute, second)
  }

  return parseDate(trimmed)
}

function buildDate(dayStr: string, monthStr: string, yearStr: string): number {
  const day = parseInt(dayStr, 10)
  const month = parseInt(monthStr, 10) - 1
  const year = normalizeYear(parseInt(yearStr, 10))
  return Date.UTC(year, month, day)
}

function normalizeYear(year: number): number {
  return year < 100 ? year + 2000 : year
}
