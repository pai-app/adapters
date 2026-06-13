import { describe, it, expect } from 'vitest'
import { hdfcCreditPdfAdapter } from '@/banks/hdfc/credit-pdf'
import { loadFixture, loadExpected, loadExpectedAdapterResult } from '../helpers'

const fixture = loadFixture('hdfc/credit-april-2026.fixture.json')
const expected = loadExpected('hdfc/credit-april-2026.expected.json')

describe('HDFC credit card PDF adapter', () => {
  describe('isSupported', () => {
    it('matches an HDFC credit card statement', () => {
      expect(hdfcCreditPdfAdapter.isSupported(fixture)).toBe(true)
    })

    it('rejects a non-HDFC PDF', () => {
      const other = { kind: 'pdf' as const, name: 'other.pdf', pages: [['Some random text']] }
      expect(hdfcCreditPdfAdapter.isSupported(other)).toBe(false)
    })

    it('rejects when GSTIN present but no Credit Card Statement', () => {
      const partial = {
        kind: 'pdf' as const,
        name: 'partial.pdf',
        pages: [['HDFC Bank Credit Cards GSTIN: 27AAAAH0987L1ZF', 'Some other content']],
      }
      expect(hdfcCreditPdfAdapter.isSupported(partial)).toBe(false)
    })
  })

  describe('read', () => {
    it('extracts account details', async () => {
      const result = await hdfcCreditPdfAdapter.read(fixture)
      expect(result.account).toEqual(expected.account)
    })

    it('extracts correct number of transactions', async () => {
      const result = await hdfcCreditPdfAdapter.read(fixture)
      expect(result.transactions).toHaveLength(expected.transactions.length)
    })

    it('matches full expected output', async () => {
      const result = await hdfcCreditPdfAdapter.read(fixture)
      const expectedResult = loadExpectedAdapterResult('hdfc/credit-april-2026.expected.json')
      expect(result).toEqual(expectedResult)
    })

    it('handles continuation lines', async () => {
      const result = await hdfcCreditPdfAdapter.read(fixture)
      const netflix = result.transactions.find((t) => t.description.includes('NETFLIX'))
      expect(netflix?.description).toBe('NETFLIX INDIA SUBSCRIPTION RENEWAL APR 2026')

      const uber = result.transactions.find((t) => t.description.includes('UBER'))
      expect(uber?.description).toBe('UBER INDIA TECHNOLOGY PVT LTD BANGALORE')
    })

    it('debits are negative, credits are positive', async () => {
      const result = await hdfcCreditPdfAdapter.read(fixture)
      const debits = result.transactions.filter((t) => t.amount < 0)
      const credits = result.transactions.filter((t) => t.amount > 0)
      expect(debits).toHaveLength(8)
      expect(credits).toHaveLength(2)
    })

    it('transactions are in chronological order', async () => {
      const result = await hdfcCreditPdfAdapter.read(fixture)
      for (let i = 1; i < result.transactions.length; i++) {
        expect(result.transactions[i].date).toBeGreaterThan(result.transactions[i - 1].date)
      }
    })
  })
})
