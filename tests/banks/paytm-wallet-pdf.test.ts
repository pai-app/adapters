import { describe, it, expect } from 'vitest'
import { paytmWalletPdfAdapter } from '@/banks/paytm/wallet-pdf'
import { loadFixture } from '../helpers'

const fixture = loadFixture('paytm/wallet-feb-2024.fixture.json')

// Fixture routing + full-output round-trips are covered generically by
// tests/fixtures.test.ts. This file keeps only adapter-specific assertions.
describe('Paytm wallet PDF adapter', () => {
  describe('isSupported', () => {
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
