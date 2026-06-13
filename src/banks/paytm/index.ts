/**
 * Paytm Payments Bank — registration module.
 *
 * Importing this file registers Paytm with the internal bank registry.
 * Two offerings: savings account and wallet.
 */

import { registerBank } from '@/registry'
import { paytmSavingsPdfAdapter } from './savings-pdf'
import { paytmWalletPdfAdapter } from './wallet-pdf'
import { paytmSavingsEmailAdapter, paytmWalletEmailAdapter } from './email'
import { PAYTM_EMAIL_DOMAINS } from './shared'

registerBank({
  id: 'paytm',
  emailDomains: PAYTM_EMAIL_DOMAINS,
  offerings: [
    {
      id: 'savings',
      kind: 'bank',
      fileAdapters: [paytmSavingsPdfAdapter],
      emailAdapters: [paytmSavingsEmailAdapter],
    },
    {
      id: 'wallet',
      kind: 'wallet',
      fileAdapters: [paytmWalletPdfAdapter],
      emailAdapters: [paytmWalletEmailAdapter],
    },
  ],
})
