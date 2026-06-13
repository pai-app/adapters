import { describe, it, expect } from 'vitest'
import { hdfcCreditPdfAdapter } from '@/banks/hdfc/credit-pdf'
import type { PdfFile } from '@/types'

function pdf(pages: string[][]): PdfFile {
  return { kind: 'pdf', name: 'synthetic.pdf', pages }
}

describe('HDFC credit PDF adapter — branches', () => {
  it('throws parse-failed when no account number is present', async () => {
    await expect(hdfcCreditPdfAdapter.read(pdf([['nothing relevant']]))).rejects.toMatchObject({
      kind: 'parse-failed',
    })
  })

  it('falls back to the alternate account number and skips header labels', async () => {
    const pages = [[
      'Alternate Account Number',
      'Statement Date', // skipped while scanning for the alt account value
      'Billing Period', // also skipped
      '9876543210',
      'DATE & TIME   TRANSACTION DESCRIPTION',
      '01/01/2024| 10:00', // date line right after header → breaks holder scan
    ]]
    const result = await hdfcCreditPdfAdapter.read(pdf(pages))
    expect(result.account.accountNumber).toEqual(['9876543210'])
    expect(result.account.customerId).toEqual(['9876543210'])
    expect(result.account.accountHolderName).toBeUndefined()
    expect(result.transactions).toHaveLength(0)
  })

  it('reads a masked card number and no alternate account number', async () => {
    const pages = [['Credit Card No.', '4111XXXXXXXX1111']]
    const result = await hdfcCreditPdfAdapter.read(pdf(pages))
    expect(result.account.accountNumber).toEqual(['4111XXXXXXXX1111'])
    expect(result.account.customerId).toBeUndefined()
  })

  it('extracts the holder name after skipping non-name header lines', async () => {
    const pages = [[
      'Credit Card No.',
      '4111XXXXXXXX1111',
      'DATE & TIME   TRANSACTION DESCRIPTION',
      'some lowercase text', // neither a date nor a holder name → skipped
      'JOHN DOE',
    ]]
    const result = await hdfcCreditPdfAdapter.read(pdf(pages))
    expect(result.account.accountHolderName).toEqual(['JOHN DOE'])
  })
})
