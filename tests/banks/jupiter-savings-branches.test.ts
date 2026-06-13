import { describe, it, expect } from 'vitest'
import { jupiterSavingsPdfAdapter } from '@/banks/jupiter/savings-pdf'
import type { PdfFile } from '@/types'

function pdf(pages: string[][]): PdfFile {
  return { kind: 'pdf', name: 'synthetic.pdf', pages }
}

describe('Jupiter savings PDF adapter — branches', () => {
  it('throws parse-failed when no account number is present', async () => {
    await expect(jupiterSavingsPdfAdapter.read(pdf([['no account here']]))).rejects.toMatchObject({
      kind: 'parse-failed',
    })
  })

  it('returns an account with only the number when metadata is absent', async () => {
    const result = await jupiterSavingsPdfAdapter.read(pdf([['Account Number 912345678901']]))
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
    const result = await jupiterSavingsPdfAdapter.read(pdf(pages))
    expect(result.transactions).toHaveLength(3)
    expect(result.transactions[0].description).toBe('SALARY')
    expect(result.transactions[0].amount).toBeGreaterThan(0)
    expect(result.transactions[1].amount).toBeLessThan(0)
  })
})
