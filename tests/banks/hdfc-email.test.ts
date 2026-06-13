import { describe, it, expect } from 'vitest'
import { hdfcSavingsEmailAdapter, hdfcCreditEmailAdapter } from '@/banks/hdfc/email'
import { makeEmail, makeAttachment } from '../helpers'

const pdf = makeAttachment()

describe('HDFC savings email adapter', () => {
  it('rejects emails without a pdf attachment', async () => {
    const email = makeEmail({ from: 'statement@hdfcbank.net', attachments: [] })
    expect(await hdfcSavingsEmailAdapter.isSupported(email)).toBe(false)
  })

  it('matches a statement sender that is not a credit card statement', async () => {
    const email = makeEmail({
      from: 'statement@hdfcbank.net',
      subject: 'Account statement',
      attachments: [pdf],
    })
    expect(await hdfcSavingsEmailAdapter.isSupported(email)).toBe(true)
  })

  it('rejects a credit card statement subject', async () => {
    const email = makeEmail({
      from: 'statement@hdfcbank.net',
      subject: 'Credit Card statement',
      attachments: [pdf],
    })
    expect(await hdfcSavingsEmailAdapter.isSupported(email)).toBe(false)
  })

  it('rejects a non-statement sender', async () => {
    const email = makeEmail({ from: 'alerts@hdfcbank.net', attachments: [pdf] })
    expect(await hdfcSavingsEmailAdapter.isSupported(email)).toBe(false)
  })

  it('read returns null (body has no transactions)', async () => {
    expect(await hdfcSavingsEmailAdapter.read(makeEmail({ attachments: [pdf] }))).toBeNull()
  })
})

describe('HDFC credit email adapter', () => {
  it('rejects emails without a pdf attachment', async () => {
    expect(await hdfcCreditEmailAdapter.isSupported(makeEmail({ attachments: [] }))).toBe(false)
  })

  it('matches a "credit card statement" subject regardless of sender', async () => {
    const email = makeEmail({
      from: 'cards@hdfcbank.net',
      subject: 'Your Credit Card Statement is ready',
      attachments: [pdf],
    })
    expect(await hdfcCreditEmailAdapter.isSupported(email)).toBe(true)
  })

  it('matches a statement sender with a credit card subject', async () => {
    const email = makeEmail({
      from: 'statement@hdfcbank.net',
      subject: 'credit card',
      attachments: [pdf],
    })
    expect(await hdfcCreditEmailAdapter.isSupported(email)).toBe(true)
  })

  it('rejects an unrelated subject and sender', async () => {
    const email = makeEmail({ from: 'alerts@hdfcbank.net', subject: 'OTP', attachments: [pdf] })
    expect(await hdfcCreditEmailAdapter.isSupported(email)).toBe(false)
  })

  it('read returns null', async () => {
    expect(await hdfcCreditEmailAdapter.read(makeEmail({ attachments: [pdf] }))).toBeNull()
  })

  it('detects a pdf attachment by filename extension', async () => {
    const att = makeAttachment({ mimeType: 'application/octet-stream', filename: 'card.PDF' })
    const email = makeEmail({ subject: 'Credit Card Statement', attachments: [att] })
    expect(await hdfcCreditEmailAdapter.isSupported(email)).toBe(true)
  })
})
