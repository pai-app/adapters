import { describe, it, expect } from 'vitest'
import { parseDateTimeAmPm, hasPdfAttachment } from '@/banks/paytm/shared'
import { makeEmail, makeAttachment } from '../helpers'

describe('parseDateTimeAmPm', () => {
  const base = Date.UTC(2024, 0, 15)

  it('returns the base date when the time line does not match', () => {
    expect(parseDateTimeAmPm('15 Jan 2024', 'not a time')).toBe(base)
  })

  it('parses an AM time', () => {
    expect(parseDateTimeAmPm('15 Jan 2024', '10:15 AM')).toBe(base + 10 * 3_600_000 + 15 * 60_000)
  })

  it('shifts PM hours by 12', () => {
    expect(parseDateTimeAmPm('15 Jan 2024', '10:15 PM')).toBe(base + 22 * 3_600_000 + 15 * 60_000)
  })

  it('keeps 12 PM (noon) unchanged', () => {
    expect(parseDateTimeAmPm('15 Jan 2024', '12:00 PM')).toBe(base + 12 * 3_600_000)
  })

  it('maps 12 AM (midnight) to hour 0', () => {
    expect(parseDateTimeAmPm('15 Jan 2024', '12:30 AM')).toBe(base + 30 * 60_000)
  })
})

describe('paytm hasPdfAttachment', () => {
  it('detects by mime type', () => {
    expect(hasPdfAttachment(makeEmail({ attachments: [makeAttachment()] }))).toBe(true)
  })

  it('detects by filename extension', () => {
    const att = makeAttachment({ mimeType: 'application/octet-stream', filename: 'doc.pdf' })
    expect(hasPdfAttachment(makeEmail({ attachments: [att] }))).toBe(true)
  })

  it('returns false with no pdf attachment', () => {
    const att = makeAttachment({ mimeType: 'image/png', filename: 'logo.png' })
    expect(hasPdfAttachment(makeEmail({ attachments: [att] }))).toBe(false)
  })
})
