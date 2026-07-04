import { describe, it, expect } from 'vitest'
import { sbiSavingsPdfAdapter } from '@/banks/sbi/bank-pdf'
import { sbiLoanPdfAdapter } from '@/banks/sbi/loan-pdf'
import { ParseError } from '@/types'
import type { PdfFile } from '@/types'
import { loadFixture } from '../helpers'

const multi = loadFixture('sbi/savings-multi-jan-2026.fixture.json')
const combined = loadFixture('sbi/savings-combined-sep-2025.fixture.json')
const empty = loadFixture('sbi/savings-empty-jun-2026.fixture.json')

// Routing + full-output round-trips are covered generically by
// tests/fixtures.test.ts. This file keeps only adapter-specific assertions.
describe('SBI savings PDF adapter', () => {
  describe('isSupported', () => {
    it('rejects an empty PDF', () => {
      expect(sbiSavingsPdfAdapter.isSupported({ kind: 'pdf', name: 'empty.pdf', pages: [[]] })).toBe(false)
    })

    it('does not match a dedicated loan statement', () => {
      const loan = loadFixture('sbi/loan-jul-sep-2025.fixture.json')
      expect(sbiSavingsPdfAdapter.isSupported(loan)).toBe(false)
    })
  })

  describe('read', () => {
    it('signs credits positive and debits negative', async () => {
      const { transactions } = await sbiSavingsPdfAdapter.read(multi)
      expect(transactions.find((t) => t.description.startsWith('APY'))?.amount).toBeLessThan(0)
      expect(transactions.find((t) => t.description === 'INTEREST CREDIT')?.amount).toBeGreaterThan(0)
    })

    it('reads only the savings account from a combined statement', async () => {
      const { account, transactions } = await sbiSavingsPdfAdapter.read(combined)
      expect(account.accountNumber).toEqual(['XXXXXXX0000'])
      // The combined statement also carries a DL/TL loan section; none of its
      // rows (INTEREST/PRINCIPAL REPAYMENT to loans) must leak in.
      expect(transactions.every((t) => !/TO LOAN/i.test(t.description))).toBe(true)
    })

    it('still reports a closing balance for a zero-activity month', async () => {
      const { transactions, statement } = await sbiSavingsPdfAdapter.read(empty)
      expect(transactions).toHaveLength(0)
      expect(statement?.closingBalance).toBeGreaterThan(0)
    })

    it('throws parse-failed when there is no savings section', async () => {
      const pdf: PdfFile = { kind: 'pdf', name: 'x.pdf', pages: [['Welcome Mr. NOBODY', 'no account details here']] }
      await expect(sbiSavingsPdfAdapter.read(pdf)).rejects.toThrow(ParseError)
    })

    it('omits optional fields that are absent on the details page', async () => {
      const pdf: PdfFile = {
        kind: 'pdf',
        name: 'x.pdf',
        pages: [['TRANSACTION DETAILS', 'SAVING ACCOUNT', 'Name of the Account Holder', 'nothing else']],
      }
      const { account, transactions, statement } = await sbiSavingsPdfAdapter.read(pdf)
      expect(account).toEqual({ currency: 'INR' })
      expect(transactions).toHaveLength(0)
      expect(statement).toBeUndefined()
    })
  })
})
