import { describe, it, expect } from 'vitest'
import { sbiLoanPdfAdapter } from '@/banks/sbi/loan-pdf'
import { ParseError } from '@/types'
import type { PdfFile } from '@/types'
import { loadFixture } from '../helpers'

const julSep = loadFixture('sbi/loan-jul-sep-2025.fixture.json')
const aprJun = loadFixture('sbi/loan-apr-jun-2025.fixture.json')

// Routing + full-output round-trips are covered generically by
// tests/fixtures.test.ts. This file keeps only adapter-specific assertions.
describe('SBI loan PDF adapter', () => {
  describe('isSupported', () => {
    it('rejects an empty PDF', () => {
      expect(sbiLoanPdfAdapter.isSupported({ kind: 'pdf', name: 'empty.pdf', pages: [[]] })).toBe(false)
    })
  })

  describe('read', () => {
    it('signs repayments positive (credit) and interest charges negative (debit)', async () => {
      const { transactions } = await sbiLoanPdfAdapter.read(julSep)
      expect(transactions.find((t) => /REPAYMENT/i.test(t.description))?.amount).toBeGreaterThan(0)
      expect(transactions.find((t) => /^INTEREST$/i.test(t.description))?.amount).toBeLessThan(0)
    })

    it('keeps transactions in chronological order', async () => {
      const { transactions } = await sbiLoanPdfAdapter.read(julSep)
      for (let i = 1; i < transactions.length; i++) {
        expect(transactions[i].date).toBeGreaterThan(transactions[i - 1].date)
      }
    })

    it('reports the outstanding closing balance as a negative liability', async () => {
      const { statement } = await sbiLoanPdfAdapter.read(julSep)
      expect(statement?.closingBalance).toBeLessThan(0)
    })

    it('skips non-monetary rate-change rows', async () => {
      const { transactions } = await sbiLoanPdfAdapter.read(aprJun)
      // The Apr–Jun statement contains two "RT x TO y%" rate-revision rows that
      // carry no amount; they must not become transactions.
      expect(transactions.every((t) => !/RT\s|TO\s\d/i.test(t.description))).toBe(true)
      expect(transactions.every((t) => t.amount !== 0)).toBe(true)
    })

    it('throws parse-failed when no account number is present', async () => {
      const pdf: PdfFile = {
        kind: 'pdf',
        name: 'x.pdf',
        pages: [['STATEMENT OF ACCOUNT', 'Post Date Value Date Details Chq.No Debit Credit Balance']],
      }
      await expect(sbiLoanPdfAdapter.read(pdf)).rejects.toThrow(ParseError)
    })

    it('omits holder when the statement has no Product line', async () => {
      const pdf: PdfFile = {
        kind: 'pdf',
        name: 'x.pdf',
        pages: [[
          'STATEMENT OF ACCOUNT',
          '99999999999',
          'Post Date Value Date Details Chq.No Debit Credit Balance',
          '01/07/2025 01/07/2025 INTEREST 6,829.00 9,47,490.00DR',
          'Page no. 1',
        ]],
      }
      const { account, transactions } = await sbiLoanPdfAdapter.read(pdf)
      expect(account.accountNumber).toEqual(['99999999999'])
      expect(account.accountHolderName).toBeUndefined()
      expect(transactions).toHaveLength(1)
      expect(transactions[0].amount).toBeLessThan(0)
    })
  })
})
