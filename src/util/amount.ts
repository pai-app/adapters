/**
 * Parse a display-format amount string to signed integer minor units.
 *
 * Handles Indian number format (`1,23,456.78`) and plain (`123456.78`).
 * Strips currency symbols (`₹`, `Rs.`), commas, and whitespace.
 *
 * `sign` defaults to `1` (credit). Pass `-1` for debits when the sign
 * is determined externally (e.g. balance comparison).
 *
 * `currency` determines the minor-unit multiplier (INR → 100, JPY → 1).
 */
export function parseAmountToMinor(
  text: string,
  currency: string,
  sign: 1 | -1 = 1,
): number {
  const cleaned = text
    .replace(/[₹$€£¥₾₱₽﷼₣₺]/g, '')    // currency symbols
    .replace(/Rs\.?\s*/gi, '')             // "Rs." or "Rs "
    .replace(/,/g, '')                      // comma grouping
    .trim()

  const value = parseFloat(cleaned)
  if (isNaN(value)) throw new Error(`Unparseable amount: "${text}"`)

  const multiplier = getMinorUnitMultiplier(currency)
  return sign * Math.round(Math.abs(value) * multiplier)
}

/**
 * Strip commas and parse an amount string to a plain float (major units).
 * Useful when the caller needs to compare raw amounts before converting
 * to minor units (e.g. balance comparison to determine sign).
 */
export function parseAmountFloat(text: string): number {
  const cleaned = text
    .replace(/[₹$€£¥₾₱₽﷼₣₺]/g, '')
    .replace(/Rs\.?\s*/gi, '')
    .replace(/,/g, '')
    .trim()

  const value = parseFloat(cleaned)
  if (isNaN(value)) throw new Error(`Unparseable amount: "${text}"`)
  return value
}

/**
 * Returns 10^(number of minor units) for a currency. E.g. INR → 100, JPY → 1.
 */
function getMinorUnitMultiplier(currency: string): number {
  // Zero-decimal currencies
  const zero = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'RWF'])
  if (zero.has(currency.toUpperCase())) return 1

  // Three-decimal currencies
  const three = new Set(['BHD', 'KWD', 'OMR'])
  if (three.has(currency.toUpperCase())) return 1000

  // Default: 2 decimal places (covers INR, USD, EUR, GBP, etc.)
  return 100
}
