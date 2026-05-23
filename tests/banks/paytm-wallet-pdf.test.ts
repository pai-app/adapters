import { describe, it, expect } from 'vitest'
import { paytmWalletPdfAdapter } from '@/banks/paytm/wallet-pdf'
import { loadFixture, loadExpected, loadExpectedAdapterResult } from '../helpers'

const fixture = loadFixture('paytm/wallet-feb-2024.fixture.json')
const expected = loadExpected('paytm/wallet-feb-2024.expected.json')

describe('Paytm wallet PDF adapter', () => {
  describe('isSupported', () => {
    it('matches a Paytm wallet statement', () => {
      expect(paytmWalletPdfAdapter.isSupported(fixture)).toBe(true)
    })

    it('rejects a non-Paytm PDF', () => {
      const other = { kind: 'pdf' as const, name: 'other.pdf', pages: [['Random text']] }
      expect(paytmWalletPdfAdapter.isSupported(other)).toBe(false)
    })
  })

  describe('read', () => {
    it('extracts account from phone number', async () => {
      const result = await paytmWalletPdfAdapter.read(fixture)
      expect(result.account.accountNumber).toEqual(['919876543210'])
      expect(result.account.accountHolderName).toEqual(['ANITA SHARMA'])
    })

    it('extracts correct number of transactions', async () => {
      const result = await paytmWalletPdfAdapter.read(fixture)
      expect(result.transactions).toHaveLength(6)
    })

    it('matches full expected output', async () => {
      const result = await paytmWalletPdfAdapter.read(fixture)
      const expectedResult = loadExpectedAdapterResult('paytm/wallet-feb-2024.expected.json')
      expect(result).toEqual(expectedResult)
    })

    it('handles both combined and separated formats', async () => {
      const result = await paytmWalletPdfAdapter.read(fixture)
      // Combined format transactions (first 2)
      expect(result.transactions[0].description).toBe('Paid for order to McD Kilpauk')
      // Separated format transaction (3rd - wallet top-up)
      expect(result.transactions[2].amount).toBeGreaterThan(0)
    })

    it('debits are negative, credits are positive', async () => {
      const result = await paytmWalletPdfAdapter.read(fixture)
      const debits = result.transactions.filter((t) => t.amount < 0)
      const credits = result.transactions.filter((t) => t.amount > 0)
      expect(debits).toHaveLength(4)
      expect(credits).toHaveLength(2)
    })
  })
})
