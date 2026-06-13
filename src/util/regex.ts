/**
 * Common regex patterns reused across bank adapters.
 *
 * All patterns use `g` flag only when the adapter needs `matchAll`. Single-match
 * callers use the non-global variants or `.match()` directly.
 */

/** Indian number format: `1,23,456.78` or `1234.56`. Requires at least one comma group OR a decimal. */
export const INDIAN_AMOUNT = /(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+\.\d{2})/

/** Same as INDIAN_AMOUNT but global — for `matchAll`. */
export const INDIAN_AMOUNT_G = /(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+\.\d{2})/g

/** Date at the start of a line: `DD/MM/YY` or `DD/MM/YYYY`. */
export const DATE_SLASH_START = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\b/

/** Date anywhere: `DD/MM/YYYY` (global, for matchAll). */
export const DATE_SLASH_G = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g

/** Date with dash separator: `DD-MM-YY` or `DD-MM-YYYY` (global). */
export const DATE_DASH_G = /(\d{1,2})-(\d{1,2})-(\d{2,4})/g

/** Short month names for Paytm-style dates: `15 Jan 2024`. */
export const MONTH_NAMES: readonly string[] = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

/** HDFC-style IFSC code: `HDFC0XXXXXX`. */
export const HDFC_IFSC = /HDFC0\d{6,}/i

/** Any IFSC code: 4 alpha + 0 + 6 alphanum. */
export const IFSC_CODE = /[A-Z]{4}0[A-Z0-9]{6}/i

/** Reference/UTR number: 12–25 word characters. */
export const REFERENCE_NUMBER = /^[\w]{12,25}$/i

/** Account number: 10+ digits. */
export const ACCOUNT_NUMBER = /(\d{10,})/
