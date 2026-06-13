/**
 * Federal Bank — Email adapter.
 *
 * Federal Bank statement emails carry a PDF attachment. The adapter's `read()`
 * returns `null`, signalling `parseEmail` to fall through to the attachment path.
 */

import type { EmailAdapter } from '@/types'
import { hasPdfAttachment } from './shared'

export const federalEmailAdapter: EmailAdapter = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async isSupported(email) {
    if (!hasPdfAttachment(email)) return false
    return email.subject.toLowerCase().includes('statement')
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read() {
    return null
  },
}
