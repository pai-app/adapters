import { describe, it, expect } from 'vitest'
import { federalCreditPdfAdapter } from '@/banks/federal/credit-pdf'
import { hdfcSavingsPdfAdapter } from '@/banks/hdfc/savings-pdf'
import { paytmSavingsPdfAdapter } from '@/banks/paytm/savings-pdf'
import { readJupiterV1 } from '@/banks/jupiter/savings-v1'
import type { PdfFile } from '@/types'

const pdf = (pages: string[][]): PdfFile => ({ pages } as PdfFile)

describe('statement extraction — edge layouts', () => {
  // ── Federal positional fallback (label-free old layout) ──

  it('federal: period on the last line — no following limit/due/summary rows', async () => {
    const r = await federalCreditPdfAdapter.read(pdf([[
      '467741XXXXXX1162',
      '1,000.00',
      '01-01-2025 to 31-01-2025',
    ]]))
    expect(r.statement?.minimumDue).toBe(100000)
    expect(r.statement?.closingBalance).toBeUndefined()
    expect(r.statement?.creditLimit).toBeUndefined()
  })

  it('federal: period on a later page; no standalone min-due before it', async () => {
    const r = await federalCreditPdfAdapter.read(pdf([
      ['467741XXXXXX1162', 'a header line with no period'],
      ['01-01-2025 to 31-01-2025', '500,000 0.00 31-01-2025', '0.00 0.00 08-02-2025', '0.00 0.00 0.00 1,200.00'],
    ]))
    expect(r.statement?.creditLimit).toBe(50000000)
    expect(r.statement?.closingBalance).toBe(-120000)
    expect(r.statement?.dueDate).toBeDefined()
    expect(r.statement?.minimumDue).toBeUndefined()
  })

  it('federal: limit line has no amount and due-date line has no date', async () => {
    const r = await federalCreditPdfAdapter.read(pdf([[
      '467741XXXXXX1162',
      '01-01-2025 to 31-01-2025',
      'no amounts here',
      'no dates here',
      '1,000.00',
      '0.00 0.00 0.00 999.00',
    ]]))
    expect(r.statement?.closingBalance).toBe(-99900)
    expect(r.statement?.creditLimit).toBeUndefined()
    expect(r.statement?.dueDate).toBeUndefined()
  })

  // ── HDFC savings summary edge cases ──

  it('hdfc savings: stacked "Closing Balance" label with the value below', async () => {
    const r = await hdfcSavingsPdfAdapter.read(pdf([[
      ': 50100201954560',
      'Opening Balance : 1,00,000.00',
      'Closing Balance',
      'no amount on this line',
      ': 1,23,456.78',
    ]]))
    expect(r.statement?.closingBalance).toBe(12345678)
  })

  it('hdfc savings: summary header on the last line (value row above)', async () => {
    const r = await hdfcSavingsPdfAdapter.read(pdf([[
      ': 50100201954560',
      'Opening Balance : 1,00,000.00',
      '5,42,979.85 2,00,781.00 1,29,681.62 4,71,880.47',
      'Closing BalanceCredit AmountDebit AmountOpening Balance',
    ]]))
    expect(r.statement?.closingBalance).toBe(54297985)
  })

  // ── Paytm savings summary edge cases ──

  it('paytm savings: tabular header whose first value row lacks amounts', async () => {
    const r = await paytmSavingsPdfAdapter.read(pdf([[
      'ACCOUNT NUMBER ACCOUNT TYPE IFSC MICR',
      '912345678901234 Savings PYTM0123456 123456789',
      'OPENING BALANCE Debits Credits CLOSING BALANCE',
      'a value row with no amounts',
      'Rs.1,000.00 Rs.2,500.00',
    ]]))
    expect(r.statement?.closingBalance).toBe(250000)
  })

  it('paytm savings: stacked CLOSING BALANCE label with no amount above', async () => {
    const r = await paytmSavingsPdfAdapter.read(pdf([[
      'ACCOUNT NUMBER ACCOUNT TYPE IFSC MICR',
      '912345678901234 Savings PYTM0123456 123456789',
      'no amount on this line',
      'CLOSING BALANCE',
    ]]))
    expect(r.statement).toBeUndefined()
  })

  // ── Jupiter V1: last transaction row is the final line (no footer after it) ──

  it('jupiter v1: closing balance from the last transaction when it ends the page', () => {
    const r = readJupiterV1([[
      'Account Number 7778010025000000',
      '01/03/2026 01/03/2026 SALARY CREDIT TFR 5000.00 15000.00 Cr',
    ]])
    expect(r.statement?.closingBalance).toBe(1500000)
  })

  it('jupiter v1: a row with a single amount is skipped', () => {
    const r = readJupiterV1([[
      'Account Number 7778010025000000',
      '02/03/2026 NARRATION ONLY 5000.00',
      '03/03/2026 02/03/2026 SALARY CREDIT TFR 1000.00 9000.00 Cr',
    ]])
    expect(r.transactions).toHaveLength(1)
  })

  it('jupiter v1: a transaction whose row wraps onto the next line', () => {
    const r = readJupiterV1([[
      'Account Number 7778010025000000',
      '02/03/2026 02/03/2026 SOME PARTICULARS 1000.00',
      'WRAPPED CONTINUATION TFR 9000.00 Cr',
      '05/03/2026 05/03/2026 NEXT TXN TFR 500.00 8500.00 Dr',
    ]])
    expect(r.transactions).toHaveLength(2)
  })
})
