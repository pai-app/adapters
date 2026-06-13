import { describe, it, expect } from 'vitest'
import { paytmSavingsPdfAdapter } from '@/banks/paytm/savings-pdf'
import type { PdfFile } from '@/types'

function pdf(pages: string[][]): PdfFile {
  return { kind: 'pdf', name: 'synthetic.pdf', pages }
}

describe('Paytm savings PDF adapter — branches', () => {
  it('throws parse-failed when no account number can be found', async () => {
    await expect(paytmSavingsPdfAdapter.read(pdf([['nothing useful']]))).rejects.toMatchObject({
      kind: 'parse-failed',
    })
  })

  it('extracts holder name and account from the vertical layout', async () => {
    const pages = [[
      'GSTIN: 09ABCDE1234F1Z5',
      'gstin registered address', // not a proper-case name → skipped
      'John Doe', // proper-case name right after GSTIN
      'ACCOUNT NUMBER',
      'pending', // not a number → skipped, continues scanning
      'ACCOUNT NUMBER',
      '912345678901',
      'ACCOUNT TYPE',
      'Savings',
      'IFSC',
      'PYTM0123456',
      'MICR',
      '110000001',
    ]]
    const result = await paytmSavingsPdfAdapter.read(pdf(pages))
    expect(result.account.accountNumber).toEqual(['912345678901'])
    expect(result.account.ifscCode).toEqual(['PYTM0123456'])
    expect(result.account.micrCode).toEqual(['110000001'])
    expect(result.account.accountHolderName).toEqual(['John Doe'])
  })

  it('ignores a table header whose value row has too few columns', async () => {
    const pages = [[
      'ACCOUNT NUMBER   ACCOUNT TYPE   IFSC   MICR',
      '912345678901   Savings', // < 4 columns → ignored
      'ACCOUNT NUMBER',
      '912345678901',
    ]]
    const result = await paytmSavingsPdfAdapter.read(pdf(pages))
    expect(result.account.accountNumber).toEqual(['912345678901'])
  })

  it('throws when the table account column has no number', async () => {
    const pages = [[
      'ACCOUNT NUMBER   ACCOUNT TYPE   IFSC   MICR',
      'NOACCT   Savings   PYTM0123456   110000001',
    ]]
    await expect(paytmSavingsPdfAdapter.read(pdf(pages))).rejects.toMatchObject({
      kind: 'parse-failed',
    })
  })

  it('omits MICR when the table row has a trailing empty column', async () => {
    const pages = [[
      'ACCOUNT NUMBER   ACCOUNT TYPE   IFSC   MICR',
      '912345678901   Savings   PYTM0123456   ', // trailing spaces → empty 4th column
    ]]
    const result = await paytmSavingsPdfAdapter.read(pdf(pages))
    expect(result.account.accountNumber).toEqual(['912345678901'])
    expect(result.account.ifscCode).toEqual(['PYTM0123456'])
    expect(result.account.micrCode).toEqual([])
  })

  it('parses transactions across the table layout and edge cases', async () => {
    const pages = [[
      'ACCOUNT NUMBER   ACCOUNT TYPE   IFSC   MICR',
      '912345678901   Savings   PYTM0123456   110000001',
      'DATE & TIME   TRANSACTION DETAILS   AMOUNT   BALANCE',
      '',
      '15 Apr 2024',
      '10:15 AM',
      'Grocery shopping',
      '+ Rs.500.00   Rs.6,000.00',
      'Extra note line', // optional extra description line after the amount
      '16 Apr 2024',
      'not a time', // date not followed by a time → skipped
      '17 Apr 2024',
      '11:00 AM',
      '18 Apr 2024', // next date before an amount → no amount line, skipped
      '11:30 AM',
      'Coffee',
      '- Rs.100.00   Rs.5,900.00',
      '19 Apr 2024', // dangling date with nothing after it → break
      'DATE & TIME   TRANSACTION DETAILS', // trailing header line → break in header strip
    ]]
    const result = await paytmSavingsPdfAdapter.read(pdf(pages))
    expect(result.account.accountNumber).toEqual(['912345678901'])
    expect(result.account.ifscCode).toEqual(['PYTM0123456'])
    expect(result.account.micrCode).toEqual(['110000001'])
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].description).toBe('Grocery shopping Extra note line')
    expect(result.transactions[0].amount).toBeGreaterThan(0)
    expect(result.transactions[1].amount).toBeLessThan(0)
  })
})
