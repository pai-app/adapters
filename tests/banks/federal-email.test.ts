import { describe, it, expect } from 'vitest'
import { federalEmailAdapter } from '@/banks/federal/email'
import { makeEmail, makeAttachment } from '../helpers'

const pdf = makeAttachment()

describe('Federal Bank email adapter', () => {
  it('rejects emails without a pdf attachment', async () => {
    expect(await federalEmailAdapter.isSupported(makeEmail({ attachments: [] }))).toBe(false)
  })

  it('matches a statement subject', async () => {
    const email = makeEmail({ subject: 'Monthly Statement', attachments: [pdf] })
    expect(await federalEmailAdapter.isSupported(email)).toBe(true)
  })

  it('rejects a non-statement subject', async () => {
    const email = makeEmail({ subject: 'Welcome', attachments: [pdf] })
    expect(await federalEmailAdapter.isSupported(email)).toBe(false)
  })

  it('read returns null', async () => {
    expect(await federalEmailAdapter.read(makeEmail({ attachments: [pdf] }))).toBeNull()
  })

  it('detects a pdf attachment by filename extension', async () => {
    const att = makeAttachment({ mimeType: 'application/octet-stream', filename: 'stmt.pdf' })
    const email = makeEmail({ subject: 'Statement', attachments: [att] })
    expect(await federalEmailAdapter.isSupported(email)).toBe(true)
  })
})
