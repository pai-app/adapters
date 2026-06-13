import { describe, it, expect } from 'vitest'
import { paytmWalletPdfAdapter } from '@/banks/paytm/wallet-pdf'
import type { PdfFile } from '@/types'

function pdf(pages: string[][]): PdfFile {
  return { kind: 'pdf', name: 'synthetic.pdf', pages }
}

describe('Paytm wallet PDF adapter — branches', () => {
  it('throws parse-failed when no phone number / account can be found', async () => {
    await expect(paytmWalletPdfAdapter.read(pdf([['no phone number here']]))).rejects.toMatchObject({
      kind: 'parse-failed',
    })
  })

  it('extracts the account from the phone number without a holder name', async () => {
    // Phone number appears on the first line, so there is no preceding holder line.
    const result = await paytmWalletPdfAdapter.read(pdf([['+91-9876543210']]))
    expect(result.account.accountNumber).toEqual(['919876543210'])
    expect(result.account.accountHolderName).toBeUndefined()
  })

  it('parses combined and separated transaction formats', async () => {
    const pages = [[
      '+91-9876543210',
      // Combined format, followed by Transaction ID and Note lines that are skipped.
      '10:15 AM',
      '- Rs.150.00 Coffee Shop Rs.5,000.00 15 Feb 2024',
      'Transaction ID 123456',
      'Note: lunch',
      // Separated format: amount line, description with a balance, then inline date.
      '11:30 AM',
      '+ Rs.2,000.00',
      'Wallet TopUp Rs.7,000.00',
      'Bank ref 16 Feb 2024',
      // Separated format with no date line at all → skipped.
      '12:45 PM',
      '- Rs.100.00',
      'No date description here',
    ]]
    const result = await paytmWalletPdfAdapter.read(pdf(pages))
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].description).toBe('Coffee Shop')
    expect(result.transactions[0].amount).toBeLessThan(0)
    expect(result.transactions[1].amount).toBeGreaterThan(0)
    expect(result.transactions[1].description).not.toContain('Rs.')
  })

  it('handles combined rows without trailers, non-amount lines, and leading dates', async () => {
    const pages = [[
      '+91-9876543210',
      // Combined credit row not followed by a Transaction ID or Note line.
      '09:00 AM',
      '+ Rs.50.00 Snack Rs.4,000.00 14 Feb 2024',
      // Time line followed by neither a combined nor an amount row → skipped.
      '09:30 AM',
      'random non amount line',
      // Separated row whose inline date is at the start of the line (no leading text).
      '10:00 AM',
      '+ Rs.300.00',
      '15 Feb 2024 wallet credit',
      // Trailing time line with nothing after it → loop breaks.
      '10:30 AM',
    ]]
    const result = await paytmWalletPdfAdapter.read(pdf(pages))
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].description).toBe('Snack')
    expect(result.transactions[0].amount).toBeGreaterThan(0)
    expect(result.transactions[1].amount).toBeGreaterThan(0)
  })
})
