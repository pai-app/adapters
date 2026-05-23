import { describe, it, expect } from 'vitest'
import { jupiterSavingsPdfAdapter } from '@/banks/jupiter/savings-pdf'
import { loadFixture, loadExpected, loadExpectedAdapterResult } from '../helpers'

const fixture = loadFixture('jupiter/savings-april-2026.fixture.json')
const expected = loadExpected('jupiter/savings-april-2026.expected.json')

describe('Jupiter savings PDF adapter', () => {
  describe('isSupported', () => {
    it('matches a Jupiter statement', () => {
      expect(jupiterSavingsPdfAdapter.isSupported(fixture)).toBe(true)
    })

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
    it('extracts account details with all metadata', async () => {
      const result = await jupiterSavingsPdfAdapter.read(fixture)
      expect(result.account).toEqual(expected.account)
    })

    it('extracts correct number of transactions', async () => {
      const result = await jupiterSavingsPdfAdapter.read(fixture)
      expect(result.transactions).toHaveLength(expected.transactions.length)
    })

    it('matches full expected output', async () => {
      const result = await jupiterSavingsPdfAdapter.read(fixture)
      const expectedResult = loadExpectedAdapterResult('jupiter/savings-april-2026.expected.json')
      expect(result).toEqual(expectedResult)
    })

    it('debits are negative, credits are positive', async () => {
      const result = await jupiterSavingsPdfAdapter.read(fixture)
      const debits = result.transactions.filter((t) => t.amount < 0)
      const credits = result.transactions.filter((t) => t.amount > 0)
      expect(debits).toHaveLength(7)
      expect(credits).toHaveLength(3)
    })
  })
})
