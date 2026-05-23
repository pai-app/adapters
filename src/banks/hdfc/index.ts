/**
 * HDFC Bank — registration module.
 *
 * Importing this file registers HDFC with the package's internal bank registry.
 * The package's `parseFile` / `parseEmail` entry points automatically walk
 * all registered banks.
 */

import { registerBank } from '@/registry'
import { hdfcSavingsPdfAdapter } from './savings-pdf'
import { hdfcCreditPdfAdapter } from './credit-pdf'
import { hdfcSavingsEmailAdapter, hdfcCreditEmailAdapter } from './email'
import { HDFC_EMAIL_DOMAINS } from './shared'

registerBank({
  id: 'hdfc',
  emailDomains: HDFC_EMAIL_DOMAINS,
  offerings: [
    {
      id: 'savings',
      kind: 'bank',
      fileAdapters: [hdfcSavingsPdfAdapter],
      emailAdapters: [hdfcSavingsEmailAdapter],
    },
    {
      id: 'credit-card',
      kind: 'credit-card',
      fileAdapters: [hdfcCreditPdfAdapter],
      emailAdapters: [hdfcCreditEmailAdapter],
    },
  ],
})
