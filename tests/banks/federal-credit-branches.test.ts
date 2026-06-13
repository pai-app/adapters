import { describe, it, expect } from 'vitest'
import { federalCreditPdfAdapter } from '@/banks/federal/credit-pdf'
import type { PdfFile } from '@/types'

function pdf(pages: string[][]): PdfFile {
  return { kind: 'pdf', name: 'synthetic.pdf', pages }
}

describe('Federal credit PDF adapter — branches', () => {
  it('throws parse-failed when no card number is present', async () => {
    await expect(federalCreditPdfAdapter.read(pdf([['nothing relevant here']]))).rejects.toMatchObject({
      kind: 'parse-failed',
    })
  })

  it('uses the fallback card-number scan and extracts the holder name', async () => {
    const pages = [[
      '4111XXXXXXXX1111', // no "Credit Card Number" label → fallback scan
      'Name and Address of the Customer',
      'c/o family member', // not a holder name → skipped
      'JOHN DOE',
      '01-01-24 COFFEE SHOP 150.00 Dr',
    ]]
    const result = await federalCreditPdfAdapter.read(pdf(pages))
    expect(result.account.accountNumber).toEqual(['4111XXXXXXXX1111'])
    expect(result.account.accountHolderName).toEqual(['JOHN DOE'])
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].amount).toBeLessThan(0)
  })

  it('returns no holder name when the holder label is absent', async () => {
    const pages = [[
      'Credit Card Number',
      '4111111111111111',
      '01-01-24 SHOP 100.00 Cr',
    ]]
    const result = await federalCreditPdfAdapter.read(pdf(pages))
    expect(result.account.accountNumber).toEqual(['4111111111111111'])
    expect(result.account.accountHolderName).toBeUndefined()
    expect(result.transactions[0].amount).toBeGreaterThan(0)
  })

  it('skips rows with no amount or empty description and handles unsigned rows', async () => {
    const pages = [[
      'Credit Card Number',
      '4111111111111111',
      '01-01-24 DESCRIPTION ONLY Cr', // no amount → skipped
      '02-02-24 PAYMENT 250.00 |', // no Cr/Dr suffix → treated as credit
      '03-03-24 100.00 Cr', // empty description after stripping → skipped
      '04-04-24 COFFEE 50.00 Dr', // normal debit
    ]]
    const result = await federalCreditPdfAdapter.read(pdf(pages))
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].description).toContain('PAYMENT')
    expect(result.transactions[0].amount).toBeGreaterThan(0)
    expect(result.transactions[1].amount).toBeLessThan(0)
  })
})
