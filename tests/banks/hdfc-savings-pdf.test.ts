import { describe, it, expect } from 'vitest'
import { hdfcSavingsPdfAdapter } from '@/banks/hdfc/savings-pdf'
import { loadFixture } from '../helpers'

const fixture = loadFixture('hdfc/savings-april-2026.fixture.json')

// Fixture routing + full-output round-trips are covered generically by
// tests/fixtures.test.ts. This file keeps only adapter-specific assertions.
describe('HDFC savings PDF adapter', () => {
  describe('isSupported', () => {
    it('rejects an empty PDF', () => {
      const empty = { kind: 'pdf' as const, name: 'empty.pdf', pages: [[]] }
      expect(hdfcSavingsPdfAdapter.isSupported(empty)).toBe(false)
    })
  })

  describe('read', () => {
    it('debits are negative, credits are positive', async () => {
      const result = await hdfcSavingsPdfAdapter.read(fixture)
      const debits = result.transactions.filter((t) => t.amount < 0)
      const credits = result.transactions.filter((t) => t.amount > 0)
      expect(debits).toHaveLength(11)
      expect(credits).toHaveLength(4)
    })

    it('transactions are in chronological order', async () => {
      const result = await hdfcSavingsPdfAdapter.read(fixture)
      for (let i = 1; i < result.transactions.length; i++) {
        expect(result.transactions[i].date).toBeGreaterThan(result.transactions[i - 1].date)
      }
    })
  })
})
