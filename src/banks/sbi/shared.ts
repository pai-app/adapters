/**
 * Shared SBI patterns and helpers reused across the savings e-statement and
 * loan statement adapters.
 */

/** SBI IFSC pattern: `SBIN0` followed by exactly 6 alphanumerics. */
export const SBI_IFSC_REGEX = /SBIN0[A-Z0-9]{6}/i

/** Email sender domains for SBI statement mailers (e.g. `alerts.sbi.co.in`). */
export const SBI_EMAIL_DOMAINS = ['sbi.co.in', 'sbi.bank.in']

/**
 * An Indian-format money value with exactly two decimals (`7,08,419.00`), not
 * followed by a further digit — so a 3-decimal rate like `9.250` never matches.
 * Global; use with `matchAll` / `match`.
 */
export const SBI_AMOUNT_G = /[\d,]+\.\d{2}(?!\d)/g

/** First `SBIN0…` IFSC found across all pages, upper-cased. */
export function findIfsc(joined: string): string | null {
  const m = SBI_IFSC_REGEX.exec(joined)
  return m ? m[0].toUpperCase() : null
}
