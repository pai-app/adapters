import { describe, it, expect } from 'vitest'
import { federalCreditPdfAdapter } from '@/banks/federal/credit-pdf'
import { loadFixture, loadExpected, loadExpectedAdapterResult } from '../helpers'

const fixture = loadFixture('federal/credit-april-2026.fixture.json')
const expected = loadExpected('federal/credit-april-2026.expected.json')

describe('Federal Bank credit card PDF adapter', () => {
  describe('isSupported', () => {
    it('matches a Federal Bank credit card statement', () => {
      expect(federalCreditPdfAdapter.isSupported(fixture)).toBe(true)
    })

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
    it('extracts account details', async () => {
      const result = await federalCreditPdfAdapter.read(fixture)
      expect(result.account).toEqual(expected.account)
    })

    it('extracts correct number of transactions', async () => {
      const result = await federalCreditPdfAdapter.read(fixture)
      expect(result.transactions).toHaveLength(expected.transactions.length)
    })

    it('matches full expected output', async () => {
      const result = await federalCreditPdfAdapter.read(fixture)
      const expectedResult = loadExpectedAdapterResult('federal/credit-april-2026.expected.json')
      expect(result).toEqual(expectedResult)
    })

    it('debits are negative, credits are positive', async () => {
      const result = await federalCreditPdfAdapter.read(fixture)
      const debits = result.transactions.filter((t) => t.amount < 0)
      const credits = result.transactions.filter((t) => t.amount > 0)
      expect(debits).toHaveLength(9)
      expect(credits).toHaveLength(2)
    })
  })
})
