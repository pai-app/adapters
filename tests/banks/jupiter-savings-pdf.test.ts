import { describe, it, expect } from 'vitest'
import { jupiterSavingsPdfAdapter } from '@/banks/jupiter/savings-pdf'
import { loadFixture } from '../helpers'

const fixture = loadFixture('jupiter/savings-march-2026.fixture.json')

// Fixture routing + full-output round-trips are covered generically by
// tests/fixtures.test.ts. This file keeps only adapter-specific assertions.
describe('Jupiter savings PDF adapter', () => {
  describe('isSupported', () => {
    it('rejects a plain Federal Bank PDF (no Fintech Partnerships)', () => {
      const federal = {
        kind: 'pdf' as const,
        name: 'federal.pdf',
        pages: [['Federal Bank Ltd', 'info@federalbank.co.in']],
      }
      expect(jupiterSavingsPdfAdapter.isSupported(federal)).toBe(false)
    })
  })

  describe('read', () => {
    it('debits are negative, credits are positive', async () => {
      const result = await jupiterSavingsPdfAdapter.read(fixture)
      const debits = result.transactions.filter((t) => t.amount < 0)
      const credits = result.transactions.filter((t) => t.amount > 0)
      expect(debits).toHaveLength(53)
      expect(credits).toHaveLength(12)
    })
  })
})
