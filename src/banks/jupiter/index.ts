/**
 * Jupiter — registration module.
 *
 * Importing this file registers Jupiter with the internal bank registry.
 */

import { registerBank } from '@/registry'
import { jupiterSavingsPdfAdapter } from './savings-pdf'
import { jupiterEmailAdapter } from './email'
import { JUPITER_EMAIL_DOMAINS } from './shared'

registerBank({
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
})
