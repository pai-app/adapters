import { describe, it, expect } from 'vitest'
import { sbiLoanAccountStatementPdfAdapter } from '@/banks/sbi/loan-account-statement-pdf'
import { sbiLoanPdfAdapter } from '@/banks/sbi/loan-pdf'
import { ParseError } from '@/types'
import type { PdfFile } from '@/types'
import { loadFixture } from '../helpers'

const closure = loadFixture('sbi/loan-account-statement-nov-2025.fixture.json')

// Routing + full-output round-trips are covered generically by
// tests/fixtures.test.ts. This file keeps only adapter-specific assertions.
describe('SBI loan account-statement PDF adapter', () => {
  describe('isSupported', () => {
    it('rejects an empty PDF', () => {
      expect(sbiLoanAccountStatementPdfAdapter.isSupported({ kind: 'pdf', name: 'e.pdf', pages: [[]] })).toBe(false)
    })

    it('does not match the quarterly EMI statement (and vice versa)', () => {
      const emi = loadFixture('sbi/loan-jul-sep-2025.fixture.json')
      expect(sbiLoanAccountStatementPdfAdapter.isSupported(emi)).toBe(false)
      expect(sbiLoanPdfAdapter.isSupported(closure)).toBe(false)
    })
  })

  describe('read', () => {
    it('signs repayments positive and interest/discharge charges negative', async () => {
      const { transactions } = await sbiLoanAccountStatementPdfAdapter.read(closure)
      expect(transactions.find((t) => /REPAYMENT/i.test(t.description))?.amount).toBeGreaterThan(0)
      expect(transactions.find((t) => /^INTEREST$/i.test(t.description))?.amount).toBeLessThan(0)
    })

    it('reverses the statement into chronological order', async () => {
      const { transactions } = await sbiLoanAccountStatementPdfAdapter.read(closure)
      for (let i = 1; i < transactions.length; i++) {
        expect(transactions[i].date).toBeGreaterThan(transactions[i - 1].date)
      }
    })

    it('reconciles: opening + net movement equals the closing balance', async () => {
      const { transactions, statement } = await sbiLoanAccountStatementPdfAdapter.read(closure)
      // Opening was -8,28,466.00; this is a closure statement, so closing is 0.
      const net = transactions.reduce((s, t) => s + t.amount, 0)
      expect(-82846600 + net).toBe(statement?.closingBalance)
      expect(statement?.closingBalance).toBe(0)
    })

    it('throws parse-failed when no account number is present', async () => {
      const pdf: PdfFile = {
        kind: 'pdf',
        name: 'x.pdf',
        pages: [['SBIN0001234', 'Account Statement from 1 Sep 2025 to 2 Nov 2025', 'Txn Date', 'Account Description : HOME LOAN']],
      }
      await expect(sbiLoanAccountStatementPdfAdapter.read(pdf)).rejects.toThrow(ParseError)
    })
  })
})
