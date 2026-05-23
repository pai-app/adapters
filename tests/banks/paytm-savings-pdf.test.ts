import { describe, it, expect } from 'vitest'
import { paytmSavingsPdfAdapter } from '@/banks/paytm/savings-pdf'
import { loadFixture, loadExpected, loadExpectedAdapterResult } from '../helpers'

const fixture = loadFixture('paytm/savings-april-2026.fixture.json')
const expected = loadExpected('paytm/savings-april-2026.expected.json')

describe('Paytm savings PDF adapter', () => {
  describe('isSupported', () => {
    it('matches a Paytm savings statement', () => {
      expect(paytmSavingsPdfAdapter.isSupported(fixture)).toBe(true)
    })

    it('rejects a non-Paytm PDF', () => {
      const other = { kind: 'pdf' as const, name: 'other.pdf', pages: [['Random text']] }
      expect(paytmSavingsPdfAdapter.isSupported(other)).toBe(false)
    })
  })

  describe('read', () => {
    it('extracts account details', async () => {
      const result = await paytmSavingsPdfAdapter.read(fixture)
      expect(result.account).toEqual(expected.account)
    })

    it('extracts correct number of transactions', async () => {
      const result = await paytmSavingsPdfAdapter.read(fixture)
      expect(result.transactions).toHaveLength(7)
    })

    it('matches full expected output', async () => {
      const result = await paytmSavingsPdfAdapter.read(fixture)
      const expectedResult = loadExpectedAdapterResult('paytm/savings-april-2026.expected.json')
      expect(result).toEqual(expectedResult)
    })

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
