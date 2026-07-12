import { describe, it, expect } from 'vitest'
import { bobSavingsPdfAdapter } from '@/banks/bob/savings-pdf'
import { ParseError, type PdfFile } from '@/types'

const pdf = (pages: string[][]): PdfFile => ({ kind: 'pdf', name: 'bob.pdf', pages })

// Full-output round-trips (March/May/June) are covered generically by
// tests/fixtures.test.ts. This file keeps only adapter-specific edge cases.
describe('Bank of Baroda savings PDF adapter', () => {
  describe('isSupported', () => {
    it('rejects an empty PDF', () => {
      expect(bobSavingsPdfAdapter.isSupported(pdf([[]]))).toBe(false)
    })

    it('matches on the statement marker alone (IFSC present)', () => {
      const file = pdf([
        [
          'Statement of transactions in Savings Account 70350100009999 in INR',
          'CHENNAI, TAMIL NADU, INDIA - 600001 600012081 BARB0DBGEOR',
        ],
      ])
      expect(bobSavingsPdfAdapter.isSupported(file)).toBe(true)
    })

    it('matches when the header omits the MICR/IFSC line (older .com layout)', () => {
      const file = pdf([
        [
          'Statement of transactions in Savings Account 70350100009999 in INR for the period Aug 01, 2025 - Aug 31, 2025',
          'KADEL CHAMBERS 340 MINT STREET CHENNAI, TAMIL NADU, INDIA - 600079',
        ],
      ])
      expect(bobSavingsPdfAdapter.isSupported(file)).toBe(true)
    })

    it('rejects a non-BoB PDF that has an IFSC-like token but no marker', () => {
      const file = pdf([['Some other bank BARB0DBGEOR account statement']])
      expect(bobSavingsPdfAdapter.isSupported(file)).toBe(false)
    })
  })

  describe('read', () => {
    it('throws parse-failed when the account number is absent', async () => {
      await expect(bobSavingsPdfAdapter.read(pdf([['nothing useful here']]))).rejects.toBeInstanceOf(
        ParseError,
      )
    })

    it('throws parse-failed when the transaction table is absent', async () => {
      const file = pdf([['Statement of transactions in Savings Account 70350100009999 in INR']])
      await expect(bobSavingsPdfAdapter.read(file)).rejects.toMatchObject({ kind: 'parse-failed' })
    })

    it('parses a metadata-light statement and honours Dr (overdraft) balances', async () => {
      const file = pdf([
        [
          'Statement of transactions in Savings Account 12345678901 in INR',
          'DATE NARRATION CHQ.NO. WITHDRAWAL (DR) DEPOSIT (CR) BALANCE',
          '01-03-2026 Opening Balance 1000.00 Cr',
          '05-03-2026 ATM CASH 200.00 800.00 Dr',
          '31-03-2026 Closing Balance 800.00 Dr',
          'ABBREVIATIONS',
        ],
      ])
      const result = await bobSavingsPdfAdapter.read(file)

      expect(result.account).toEqual({ currency: 'INR', accountNumber: ['12345678901'] })
      expect(result.transactions).toEqual([
        { date: Date.UTC(2026, 2, 5), amount: -20000, description: 'ATM CASH' },
      ])
      expect(result.statement).toEqual({ closingBalance: -80000 })
    })

    it('skips a leading non-date line and omits statement when period/closing are absent', async () => {
      const file = pdf([
        [
          'Statement of transactions in Savings Account 12345678901 in INR',
          'DATE NARRATION CHQ.NO. WITHDRAWAL (DR) DEPOSIT (CR) BALANCE',
          '(continued from previous page)',
          '01-03-2026 Opening Balance 5000.00 Cr',
          '05-03-2026 UPI PAYMENT 500.00 4500.00 Cr',
          'ABBREVIATIONS',
        ],
      ])
      const result = await bobSavingsPdfAdapter.read(file)

      expect(result.transactions).toEqual([
        { date: Date.UTC(2026, 2, 5), amount: -50000, description: 'UPI PAYMENT' },
      ])
      expect(result.statement).toBeUndefined()
    })
  })
})
