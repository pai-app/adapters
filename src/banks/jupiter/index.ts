/**
 * Jupiter — bank definition.
 *
 * Exported as a plain `Bank` value and collected into `BANKS` in
 * `banks/index.ts`.
 */

import type { Bank } from '@/types'
import { jupiterSavingsPdfAdapter } from './savings-pdf'
import { jupiterEmailAdapter } from './email'
import { JUPITER_EMAIL_DOMAINS } from './shared'

export const jupiterBank: Bank = {
  id: 'jupiter',
  emailDomains: JUPITER_EMAIL_DOMAINS,
  offerings: [
    {
      id: 'upi-account',
      kind: 'bank',
      fileAdapters: [jupiterSavingsPdfAdapter],
      emailAdapters: [jupiterEmailAdapter],
    },
  ],
}
