/**
 * Jupiter — Email adapter.
 *
 * Jupiter statement emails carry a PDF attachment. The adapter's `read()`
 * returns `null`, signalling `parseEmail` to fall through to the attachment path.
 */

import type { EmailAdapter } from '@/types'
import { hasPdfAttachment } from './shared'

export const jupiterEmailAdapter: EmailAdapter = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async isSupported(email) {
    return hasPdfAttachment(email)
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read() {
    return null
  },
}
