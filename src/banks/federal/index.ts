/**
 * Federal Bank — registration module.
 *
 * Importing this file registers Federal Bank with the internal bank registry.
 */

import { registerBank } from '@/registry'
import { federalCreditPdfAdapter } from './credit-pdf'
import { federalEmailAdapter } from './email'
import { FEDERAL_EMAIL_DOMAINS } from './shared'

registerBank({
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
})
