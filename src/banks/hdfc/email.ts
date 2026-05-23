/**
 * HDFC Bank — Email adapter.
 *
 * HDFC statement emails are wrappers: they carry a PDF attachment but the body
 * itself doesn't contain transaction data. So this adapter's `read()` always
 * returns `null`, signalling the package's `parseEmail` to fall through to the
 * attachment path (which runs the file adapters on the attached PDF).
 *
 * The value of this adapter is in `isSupported` — narrowing which HDFC emails
 * are statement emails (vs. marketing, OTP, etc.) so the package doesn't waste
 * time extracting PDFs from irrelevant mail.
 */

import type { EmailAdapter } from '@/types'
import { hasPdfAttachment } from './shared'

export const hdfcSavingsEmailAdapter: EmailAdapter = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async isSupported(email) {
    if (!hasPdfAttachment(email)) return false
    const subject = email.subject.toLowerCase()
    return (
      email.from.toLowerCase().includes('statement') &&
      !subject.includes('credit card')
    )
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read() {
    // Body has no transaction data. The package handles the PDF attachment.
    return null
  },
}

export const hdfcCreditEmailAdapter: EmailAdapter = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async isSupported(email) {
    if (!hasPdfAttachment(email)) return false
    const subject = email.subject.toLowerCase()
    return (
      subject.includes('credit card statement') ||
      (email.from.toLowerCase().includes('statement') && subject.includes('credit card'))
    )
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read() {
    return null
  },
}
