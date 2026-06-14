/**
 * Internal bank/offering registration shapes. Not exported from the package.
 * Parser authors use these with `registerBank()`.
 */

import type { AccountKind } from './import-data'
import type { FileAdapter, EmailAdapter } from './adapter'

/**
 * A bank offering — one product type (savings, credit card, wallet, etc.)
 * with its own set of file and email adapters.
 *
 * `kind` is structural: one offering parses one kind of account. The package
 * uses it to fill `ImportData.kind` on the result.
 */
export type BankOffering = {
  readonly id: string
  readonly kind: AccountKind
  readonly fileAdapters?: readonly FileAdapter[]
  readonly emailAdapters?: readonly EmailAdapter[]
}

/**
 * A bank registration. `emailDomains` is the pre-filter for `parseEmail` — if
 * set, the bank's email adapters are only tested when `email.from` matches one
 * of the listed substrings. Omit or leave empty if the bank has no email
 * adapters.
 */
export type Bank = {
  readonly id: string
  readonly emailDomains?: readonly string[]
  readonly offerings: readonly BankOffering[]
}

/**
 * Public, display-free identity projection of an offering. Consumers (e.g. the
 * Pai app) join these ids with their own label/icon maps — the package never
 * owns display concerns.
 */
export type BankCatalogOffering = {
  readonly offeringId: string
  readonly kind: AccountKind
}

/** Public identity projection of a bank and its offerings. */
export type BankCatalogEntry = {
  readonly bankId: string
  readonly offerings: readonly BankCatalogOffering[]
}
