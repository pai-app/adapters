/**
 * Bank of Baroda (BoB) — bank definition.
 *
 * Exported as a plain `Bank` value and collected into `BANKS` in
 * `banks/index.ts`. BoB mails a password-protected monthly savings
 * e-statement; there is no usable email body content, so the offering carries
 * a file adapter only. `emailDomains` routes the statement attachment through
 * `parseEmail`.
 */

import type { Bank } from '@/types'
import { bobSavingsPdfAdapter } from './savings-pdf'
import { BOB_EMAIL_DOMAINS } from './shared'

export const bobBank: Bank = {
  id: 'bob',
  emailDomains: BOB_EMAIL_DOMAINS,
  offerings: [
    {
      id: 'savings',
      kind: 'bank',
      fileAdapters: [bobSavingsPdfAdapter],
    },
  ],
}
