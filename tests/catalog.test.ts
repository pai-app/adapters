import { describe, it, expect } from 'vitest'
import type { Bank } from '@/types'
import { BANKS } from '@/banks'
import { BANK_CATALOG, statementEmailDomains, collectEmailDomains } from '@/catalog'

describe('BANKS', () => {
  it('exposes a non-empty static list with unique bank ids', () => {
    expect(BANKS.length).toBeGreaterThan(0)
    const ids = BANKS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('BANK_CATALOG', () => {
  it('projects every bank and offering to its identity (id + kind only)', () => {
    expect(BANK_CATALOG.map((b) => b.bankId)).toEqual(BANKS.map((b) => b.id))

    for (const entry of BANK_CATALOG) {
      const bank = BANKS.find((b) => b.id === entry.bankId)
      expect(bank).toBeDefined()
      expect(entry.offerings.map((o) => o.offeringId)).toEqual(
        bank?.offerings.map((o) => o.id),
      )
      expect(entry.offerings.map((o) => o.kind)).toEqual(
        bank?.offerings.map((o) => o.kind),
      )
    }
  })

  it('carries no display fields (labels/icons are a consumer concern)', () => {
    for (const entry of BANK_CATALOG) {
      expect(Object.keys(entry).sort()).toEqual(['bankId', 'offerings'])
      for (const offering of entry.offerings) {
        expect(Object.keys(offering).sort()).toEqual(['kind', 'offeringId'])
      }
    }
  })
})

describe('statementEmailDomains', () => {
  it('flattens and de-duplicates every bank’s email domains', () => {
    const domains = statementEmailDomains()
    expect(new Set(domains).size).toBe(domains.length)

    const expected = new Set(BANKS.flatMap((b) => b.emailDomains ?? []))
    expect(new Set(domains)).toEqual(expected)
  })
})

describe('collectEmailDomains', () => {
  it('de-duplicates shared domains and skips banks without emailDomains', () => {
    const banks: Bank[] = [
      { id: 'gamma', emailDomains: ['shared.example', 'gamma.example'], offerings: [] },
      { id: 'delta', emailDomains: ['shared.example', 'delta.example'], offerings: [] },
      { id: 'epsilon', offerings: [] }, // no emailDomains → contributes nothing
    ]
    const domains = collectEmailDomains(banks)
    expect([...domains].sort()).toEqual(['delta.example', 'gamma.example', 'shared.example'])
  })

  it('returns an empty list when no bank declares domains', () => {
    expect(collectEmailDomains([{ id: 'x', offerings: [] }])).toEqual([])
  })
})
