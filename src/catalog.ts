/**
 * Static, derived projections over the package's `BANKS` list. These are pure
 * functions of `BANKS` — fixed for a given package version, no runtime state.
 */

import type { Bank, BankCatalogEntry } from '@/types'
import { BANKS } from '@/banks'

/**
 * Identity catalog: every bank's id with its offerings' ids and kinds. Display
 * concerns (labels, icons) are deliberately absent — consumers join these ids
 * with their own display maps.
 */
export const BANK_CATALOG: readonly BankCatalogEntry[] = BANKS.map((bank) => ({
  bankId: bank.id,
  offerings: bank.offerings.map((offering) => ({
    offeringId: offering.id,
    kind: offering.kind,
  })),
}))

/**
 * Flatten and de-duplicate every bank's statement email domains. Pure over its
 * `banks` argument; banks without `emailDomains` contribute nothing. Exported
 * for unit testing — the public entry point is `statementEmailDomains`.
 */
export function collectEmailDomains(banks: readonly Bank[]): readonly string[] {
  return [...new Set(banks.flatMap((bank) => bank.emailDomains ?? []))]
}

/**
 * Flat, de-duplicated list of every bank's statement email domains. Consumers
 * use it as the server-side pre-filter when sweeping a mailbox for statement
 * emails (mirrors `parseEmail`'s own `email.from` pre-filter).
 */
export function statementEmailDomains(): readonly string[] {
  return collectEmailDomains(BANKS)
}
