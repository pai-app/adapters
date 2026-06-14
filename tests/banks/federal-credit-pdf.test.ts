import { describe, it, expect } from 'vitest'
import { federalCreditPdfAdapter } from '@/banks/federal/credit-pdf'
import { loadFixture } from '../helpers'

const fixture = loadFixture('federal/credit-april-2026.fixture.json')

// Fixture routing + full-output round-trips are covered generically by
// tests/fixtures.test.ts. This file keeps only adapter-specific assertions:
// negative isSupported cases and semantic checks.
describe('Federal Bank credit card PDF adapter', () => {
  describe('isSupported', () => {
    it('rejects a non-Federal PDF', () => {
      const other = { kind: 'pdf' as const, name: 'other.pdf', pages: [['Random text']] }
      expect(federalCreditPdfAdapter.isSupported(other)).toBe(false)
    })

    it('rejects a Jupiter PDF (Fintech Partnerships)', () => {
      const jupiter = {
        kind: 'pdf' as const,
        name: 'jupiter.pdf',
        pages: [['info@federalbank.co.in', 'Fintech Partnerships']],
      }
      expect(federalCreditPdfAdapter.isSupported(jupiter)).toBe(false)
    })
  })

  describe('read', () => {
    it('debits are negative, credits are positive', async () => {
      const result = await federalCreditPdfAdapter.read(fixture)
      const debits = result.transactions.filter((t) => t.amount < 0)
      const credits = result.transactions.filter((t) => t.amount > 0)
      expect(debits).toHaveLength(9)
      expect(credits).toHaveLength(2)
    })
  })
})
