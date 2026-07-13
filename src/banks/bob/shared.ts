/**
 * Shared Bank of Baroda patterns reused across the BoB adapter(s).
 */

/** Marker phrase unique to a BoB savings e-statement transaction table. */
export const BOB_STATEMENT_MARKER = /Statement of transactions in Savings Account/i

/** Email sender domains for Bank of Baroda statement mailers.
 *  `bankofbaroda.bank.in` is the current domain (e.g.
 *  `estatement@bankofbaroda.bank.in`); `bankofbaroda.com` and
 *  `bankofbaroda.co.in` are older domains still present on archived
 *  statement mail (`estatement@bankofbaroda.com`,
 *  `statement.edb@bankofbaroda.co.in`). */
export const BOB_EMAIL_DOMAINS = [
  'bankofbaroda.bank.in',
  'bankofbaroda.com',
  'bankofbaroda.co.in',
]
