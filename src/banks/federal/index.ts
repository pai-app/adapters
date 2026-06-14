/**
 * Federal Bank — bank definition.
 *
 * Exported as a plain `Bank` value and collected into `BANKS` in
 * `banks/index.ts`.
 */

import type { Bank } from '@/types'
import { federalCreditPdfAdapter } from './credit-pdf'
import { federalEmailAdapter } from './email'
import { FEDERAL_EMAIL_DOMAINS } from './shared'

export const federalBank: Bank = {
  id: 'federal',
  emailDomains: FEDERAL_EMAIL_DOMAINS,
  offerings: [
    {
      id: 'credit-card',
      kind: 'credit-card',
      fileAdapters: [federalCreditPdfAdapter],
      emailAdapters: [federalEmailAdapter],
    },
  ],
}
