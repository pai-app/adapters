/**
 * Paytm Payments Bank — Email adapter.
 *
 * Paytm statement emails carry a PDF attachment. Each adapter's `read()`
 * returns `null`, signalling `parseEmail` to fall through to the attachment path.
 *
 * Savings vs. wallet is distinguished by subject line keywords.
 */

import type { EmailAdapter } from '@/types'
import { hasPdfAttachment } from './shared'

export const paytmSavingsEmailAdapter: EmailAdapter = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async isSupported(email) {
    if (!hasPdfAttachment(email)) return false
    return email.subject.toLowerCase().includes('paytm payments bank statement')
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read() {
    return null
  },
}

export const paytmWalletEmailAdapter: EmailAdapter = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async isSupported(email) {
    if (!hasPdfAttachment(email)) return false
    const subject = email.subject.toLowerCase()
    return (
      subject.includes('paytm wallet statement') ||
      subject.includes('paytm payments bank wallet statement')
    )
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read() {
    return null
  },
}
