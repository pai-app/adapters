import type { Bank } from '@/types'
import { log } from '@/log'

const banks: Bank[] = []

/**
 * Register a bank and its offerings. Called at module-load time from each
 * `banks/<bank>/index.ts`. Idempotent — re-registering the same `id` replaces
 * the previous entry.
 */
export function registerBank(bank: Bank): void {
  const idx = banks.findIndex((b) => b.id === bank.id)
  if (idx >= 0) {
    banks[idx] = bank
  } else {
    banks.push(bank)
  }
  log.registry('registered bank %s (%d offerings)', bank.id, bank.offerings.length)
}

/** Returns all registered banks. */
export function registeredBanks(): readonly Bank[] {
  return banks
}

/**
 * Flat, de-duplicated list of every registered bank's statement email
 * domains. Public — consumers use it as the server-side pre-filter when
 * sweeping a mailbox for statement emails (mirrors `parseEmail`'s own
 * `email.from` pre-filter).
 */
export function statementEmailDomains(): readonly string[] {
  return [...new Set(banks.flatMap((b) => b.emailDomains ?? []))]
}
