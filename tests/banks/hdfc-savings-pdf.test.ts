import { describe, it, expect } from 'vitest'
import { hdfcSavingsPdfAdapter } from '@/banks/hdfc/savings-pdf'
import { loadFixture, loadExpected, loadExpectedAdapterResult } from '../helpers'

const fixture = loadFixture('hdfc/savings-april-2026.fixture.json')
const expected = loadExpected('hdfc/savings-april-2026.expected.json')

describe('HDFC savings PDF adapter', () => {
  describe('isSupported', () => {
    it('matches an HDFC savings statement', () => {
      expect(hdfcSavingsPdfAdapter.isSupported(fixture)).toBe(true)
    })

    it('rejects an empty PDF', () => {
      const empty = { kind: 'pdf' as const, name: 'empty.pdf', pages: [[]] }
      expect(hdfcSavingsPdfAdapter.isSupported(empty)).toBe(false)
    })
  })

  describe('read', () => {
    it('extracts account details', async () => {
      const result = await hdfcSavingsPdfAdapter.read(fixture)
      expect(result.account).toEqual(expected.account)
    })

    it('extracts correct number of transactions', async () => {
      const result = await hdfcSavingsPdfAdapter.read(fixture)
      expect(result.transactions).toHaveLength(expected.transactions.length)
    })

    it('matches full expected output', async () => {
      const result = await hdfcSavingsPdfAdapter.read(fixture)
      const expectedResult = loadExpectedAdapterResult('hdfc/savings-april-2026.expected.json')
      expect(result).toEqual(expectedResult)
    })

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
