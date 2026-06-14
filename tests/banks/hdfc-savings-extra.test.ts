import { describe, it, expect } from 'vitest'
import { hdfcSavingsPdfAdapter } from '@/banks/hdfc/savings-pdf'
import type { PdfFile } from '@/types'

function pdf(pages: string[][]): PdfFile {
  return { kind: 'pdf', name: 'synthetic.pdf', pages }
}

describe('HDFC savings PDF adapter — error paths', () => {
  it('throws parse-failed when no account number can be found', async () => {
    await expect(hdfcSavingsPdfAdapter.read(pdf([['no useful data here']]))).rejects.toMatchObject({
      kind: 'parse-failed',
    })
  })

  it('throws parse-failed when the opening balance is missing', async () => {
    const pages = [[
      'Account Number 50100123456789',
      '01/01/2024 SOMETHING 100.00 0.00 1100.00',
    ]]
    await expect(hdfcSavingsPdfAdapter.read(pdf(pages))).rejects.toMatchObject({
      kind: 'parse-failed',
    })
  })

  it('throws parse-failed when the account label has no digits', async () => {
    const pages = [['Account Number', 'Opening Balance 1000.00']]
    await expect(hdfcSavingsPdfAdapter.read(pdf(pages))).rejects.toMatchObject({
      kind: 'parse-failed',
    })
  })
})

describe('HDFC savings PDF adapter — label-based extraction', () => {
  it('extracts the account number via the labelled fallback path', async () => {
    const pages = [[
      'Account Number',
      '50100123456789', // value on the next line (label scan must advance)
      'Opening Balance 1000.00',
      '01/01/2024 GROCERY STORE 250.00 0.00 750.00',
    ]]
    const result = await hdfcSavingsPdfAdapter.read(pdf(pages))
    expect(result.account.accountNumber).toEqual(['50100123456789'])
    expect(result.transactions).toHaveLength(1)
  })

  it('parses reference numbers, value dates, and both signs across rows', async () => {
    const pages = [[
      'Account Number',
      '50100999888777',
      'Opening Balance',
      '1000.00',
      // Credit with an explicit value date + numeric reference number.
      '01/01/2024 SALARY 12345678901234 02/01/2024 5000.00 0.00 6000.00',
      // Description already containing "Value Dt" → ref/value-date block skipped.
      '03/01/2024 ADJUST Value Dt 100.00 0.00 5900.00',
      // Short numeric reference (4+ digit fallback, leading zeros stripped).
      '04/01/2024 ATM 007890 250.00 0.00 5650.00',
      // Alphanumeric reference → matched but not appended as a numeric Ref.
      '05/01/2024 NEFT ABCD12345678 300.00 0.00 5350.00',
      // Date line that never reaches two amounts → not a transaction.
      '30/01/2024 PARTIAL 5.00',
      'continuation text with no date',
    ]]
    const result = await hdfcSavingsPdfAdapter.read(pdf(pages))
    expect(result.transactions).toHaveLength(4)
    expect(result.transactions[0].amount).toBeGreaterThan(0)
    expect(result.transactions[1].amount).toBeLessThan(0)
    expect(result.transactions[0].description).toContain('Value Dt 02/01/2024')
    expect(result.transactions[0].description).toContain('Ref 12345678901234')
    expect(result.transactions[2].description).toContain('Ref 7890')
  })
})

describe('HDFC savings PDF adapter — inline footer metadata', () => {
  it('extracts inline footer-style metadata and ref/value-date details', async () => {
    const pages = [[
      'MR. JOHN DOE',
      'Cust ID : 1234567',
      'RTGS/NEFT IFSC: HDFC0001073',
      'MICR : 600240051',
      'Account Number 50100123456789',
      'Opening Balance',
      '1000.00',
      '01/01/2024 NETBANKING 12345678901234 01/01/2024 100.00 0.00 1100.00',
      '02/01/2024 ATM CASH 200.00 0.00 900.00',
    ]]
    const result = await hdfcSavingsPdfAdapter.read(pdf(pages))
    expect(result.account.accountHolderName).toEqual(['JOHN DOE'])
    expect(result.account.customerId).toEqual(['1234567'])
    expect(result.account.ifscCode).toEqual(['HDFC0001073'])
    expect(result.account.micrCode).toEqual(['600240051'])
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].amount).toBeGreaterThan(0)
    expect(result.transactions[1].amount).toBeLessThan(0)
    expect(result.transactions[0].description).toContain('Value Dt 01/01/2024')
    expect(result.transactions[0].description).toContain('Ref 12345678901234')
  })
})
