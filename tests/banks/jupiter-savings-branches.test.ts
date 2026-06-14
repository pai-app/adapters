import { describe, it, expect } from 'vitest'
import { jupiterSavingsPdfAdapter } from '@/banks/jupiter/savings-pdf'
import type { PdfFile } from '@/types'

/** V1 (app-download) synthetic input — carries the "Fintech Partnerships" marker. */
function pdfV1(pages: string[][]): PdfFile {
  const marked =
    pages.length > 0
      ? [['Fintech Partnerships (Jupiter)', ...pages[0]], ...pages.slice(1)]
      : [['Fintech Partnerships (Jupiter)']]
  return { kind: 'pdf', name: 'synthetic-v1.pdf', pages: marked }
}

/** V2 (emailed) synthetic input — no "Fintech Partnerships"; routes to the V2 parser. */
function pdfV2(pages: string[][]): PdfFile {
  return { kind: 'pdf', name: 'synthetic-v2.pdf', pages }
}

describe('Jupiter savings PDF adapter — V1 branches', () => {
  it('throws parse-failed when no account number is present', async () => {
    await expect(jupiterSavingsPdfAdapter.read(pdfV1([['no account here']]))).rejects.toMatchObject({
      kind: 'parse-failed',
    })
  })

  it('returns an account with only the number when metadata is absent', async () => {
    const result = await jupiterSavingsPdfAdapter.read(pdfV1([['Account Number 912345678901']]))
    expect(result.account.accountNumber).toEqual(['912345678901'])
    expect(result.account.accountHolderName).toBeUndefined()
    expect(result.account.customerId).toBeUndefined()
    expect(result.account.ifscCode).toBeUndefined()
    expect(result.account.micrCode).toBeUndefined()
    expect(result.account.swiftCode).toBeUndefined()
    expect(result.transactions).toEqual([])
  })

  it('parses credit/debit rows and skips malformed ones', async () => {
    const pages = [[
      'Account Number 912345678901',
      '01/01/2024 SALARY TFR 5000.00 10000.00 Cr', // credit, TFR stripped
      '02/01/2024 ATM 2000.00 8000.00 Dr', // debit
      '03/01/2024 ONLYONE 100.00', // only one amount → skipped
      '05/01/2024 100.00 200.00', // empty description after stripping → skipped
      '06/01/2024 LAST 50.00 150.00 Cr', // final credit (EOF)
      '07/01/2024 NOAMOUNT', // no amount → not found, leaves a trailing non-date line
      'trailing continuation line', // not a date → skipped at the loop top
    ]]
    const result = await jupiterSavingsPdfAdapter.read(pdfV1(pages))
    expect(result.transactions).toHaveLength(3)
    expect(result.transactions[0].description).toBe('SALARY')
    expect(result.transactions[0].amount).toBeGreaterThan(0)
    expect(result.transactions[1].amount).toBeLessThan(0)
  })
})

describe('Jupiter savings PDF adapter — V2 branches', () => {
  it('throws parse-failed when no account number is present', async () => {
    await expect(
      jupiterSavingsPdfAdapter.read(pdfV2([['ACCOUNT STATEMENT', 'no account number here']])),
    ).rejects.toMatchObject({ kind: 'parse-failed' })
  })

  it('extracts colon-style metadata (incl. masked account, MICR, uppercased IFSC/SWIFT)', async () => {
    const pages = [[
      'ACCOUNT STATEMENT',
      'Customer ID (UCIC): XXXXX935',
      'Account Number: XXXXX0237',
      'Customer Name: JOHN DOE',
      'IFSC: fdrl0007778',
      'Swift Code: fdrlinbbibd',
      'MICR code: 682049069',
    ]]
    const result = await jupiterSavingsPdfAdapter.read(pdfV2(pages))
    expect(result.account.accountNumber).toEqual(['XXXXX0237'])
    expect(result.account.accountHolderName).toEqual(['JOHN DOE'])
    expect(result.account.customerId).toEqual(['XXXXX935'])
    expect(result.account.ifscCode).toEqual(['FDRL0007778'])
    expect(result.account.swiftCode).toEqual(['FDRLINBBIBD'])
    expect(result.account.micrCode).toEqual(['682049069'])
    expect(result.transactions).toEqual([])
  })

  it('treats withdrawal as debit, deposit as credit, and joins wrapped particulars', async () => {
    const pages = [[
      'Account Number: 912345678901',
      '09/02/2026 09/02/2026 UPIOUT/123/vy-', // wrapped particulars
      'apar@hdfc- /5814',
      'TFR S100 120 0 68290.94 CR', // withdrawal → debit
      '10/02/2026 10/02/2026 SALARY CREDIT',
      'TFR S101 0 5000 73290.94 CR', // deposit → credit
    ]]
    const result = await jupiterSavingsPdfAdapter.read(pdfV2(pages))
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].description).toBe('UPIOUT/123/vyapar@hdfc/5814')
    expect(result.transactions[0].amount).toBeLessThan(0)
    expect(result.transactions[1].amount).toBeGreaterThan(0)
  })

  it('skips rows with no amount line and rows with an empty description', async () => {
    const pages = [[
      'Account Number: 912345678901',
      '11/02/2026 11/02/2026 NOAMOUNTROW', // next line is a new row → no amount → skipped
      '12/02/2026 12/02/2026 ', // empty particulars
      'TFR S102 10 0 100.00 CR', // amount present but description empty → skipped
      '13/02/2026 13/02/2026 REALONE',
      'TFR S103 0 200 300.00 CR', // valid credit
      '14/02/2026 14/02/2026 DANGLING', // no amount before EOF → skipped
      'just a continuation, no amount',
    ]]
    const result = await jupiterSavingsPdfAdapter.read(pdfV2(pages))
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].description).toBe('REALONE')
    expect(result.transactions[0].amount).toBeGreaterThan(0)
  })
})
