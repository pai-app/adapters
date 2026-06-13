import { describe, it, expect } from 'vitest'
import { jupiterEmailAdapter } from '@/banks/jupiter/email'
import { makeEmail, makeAttachment } from '../helpers'

describe('Jupiter email adapter', () => {
  it('matches any email carrying a pdf attachment', async () => {
    const email = makeEmail({ attachments: [makeAttachment()] })
    expect(await jupiterEmailAdapter.isSupported(email)).toBe(true)
  })

  it('rejects emails without a pdf attachment', async () => {
    const email = makeEmail({
      attachments: [makeAttachment({ mimeType: 'image/png', filename: 'logo.png' })],
    })
    expect(await jupiterEmailAdapter.isSupported(email)).toBe(false)
  })

  it('read returns null', async () => {
    expect(await jupiterEmailAdapter.read(makeEmail())).toBeNull()
  })

  it('detects a pdf attachment by filename extension', async () => {
    const att = makeAttachment({ mimeType: 'application/octet-stream', filename: 'stmt.pdf' })
    expect(await jupiterEmailAdapter.isSupported(makeEmail({ attachments: [att] }))).toBe(true)
  })
})
