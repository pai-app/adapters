import { describe, it, expect } from 'vitest'
import { paytmSavingsEmailAdapter, paytmWalletEmailAdapter } from '@/banks/paytm/email'
import { makeEmail, makeAttachment } from '../helpers'

const pdf = makeAttachment()

describe('Paytm savings email adapter', () => {
  it('rejects emails without a pdf attachment', async () => {
    expect(await paytmSavingsEmailAdapter.isSupported(makeEmail({ attachments: [] }))).toBe(false)
  })

  it('matches a Paytm Payments Bank statement subject', async () => {
    const email = makeEmail({ subject: 'Paytm Payments Bank Statement - April', attachments: [pdf] })
    expect(await paytmSavingsEmailAdapter.isSupported(email)).toBe(true)
  })

  it('rejects an unrelated subject', async () => {
    const email = makeEmail({ subject: 'Cashback offer', attachments: [pdf] })
    expect(await paytmSavingsEmailAdapter.isSupported(email)).toBe(false)
  })

  it('read returns null', async () => {
    expect(await paytmSavingsEmailAdapter.read(makeEmail({ attachments: [pdf] }))).toBeNull()
  })
})

describe('Paytm wallet email adapter', () => {
  it('rejects emails without a pdf attachment', async () => {
    expect(await paytmWalletEmailAdapter.isSupported(makeEmail({ attachments: [] }))).toBe(false)
  })

  it('matches a wallet statement subject', async () => {
    const email = makeEmail({ subject: 'Paytm Wallet Statement', attachments: [pdf] })
    expect(await paytmWalletEmailAdapter.isSupported(email)).toBe(true)
  })

  it('matches a payments bank wallet statement subject', async () => {
    const email = makeEmail({ subject: 'Paytm Payments Bank Wallet Statement', attachments: [pdf] })
    expect(await paytmWalletEmailAdapter.isSupported(email)).toBe(true)
  })

  it('rejects an unrelated subject', async () => {
    const email = makeEmail({ subject: 'Recharge successful', attachments: [pdf] })
    expect(await paytmWalletEmailAdapter.isSupported(email)).toBe(false)
  })

  it('read returns null', async () => {
    expect(await paytmWalletEmailAdapter.read(makeEmail({ attachments: [pdf] }))).toBeNull()
  })
})
