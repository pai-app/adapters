import { describe, it, expect } from 'vitest'
import { paytmSavingsPdfAdapter } from '@/banks/paytm/savings-pdf'
import { loadFixture } from '../helpers'

const fixture = loadFixture('paytm/savings-april-2026.fixture.json')

// Fixture routing + full-output round-trips are covered generically by
// tests/fixtures.test.ts. This file keeps only adapter-specific assertions.
describe('Paytm savings PDF adapter', () => {
  describe('isSupported', () => {
    it('rejects a non-Paytm PDF', () => {
      const other = { kind: 'pdf' as const, name: 'other.pdf', pages: [['Random text']] }
      expect(paytmSavingsPdfAdapter.isSupported(other)).toBe(false)
    })
  })

  describe('read', () => {
    it('strips UPI/IMPS noise from descriptions', async () => {
      const result = await paytmSavingsPdfAdapter.read(fixture)
      for (const tx of result.transactions) {
        expect(tx.description).not.toMatch(/Money (?:Sent|Received)/i)
        expect(tx.description).not.toMatch(/Paid using your Bank Account/i)
      }
    })

    it('debits are negative, credits are positive', async () => {
      const result = await paytmSavingsPdfAdapter.read(fixture)
      const debits = result.transactions.filter((t) => t.amount < 0)
      const credits = result.transactions.filter((t) => t.amount > 0)
      expect(debits).toHaveLength(4)
      expect(credits).toHaveLength(3)
    })
  })
})
