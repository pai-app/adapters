/**
 * Paytm Payments Bank — bank definition.
 *
 * Exported as a plain `Bank` value and collected into `BANKS` in
 * `banks/index.ts`. Two offerings: savings account and wallet.
 */

import type { Bank } from '@/types'
import { paytmSavingsPdfAdapter } from './savings-pdf'
import { paytmWalletPdfAdapter } from './wallet-pdf'
import { paytmSavingsEmailAdapter, paytmWalletEmailAdapter } from './email'
import { PAYTM_EMAIL_DOMAINS } from './shared'

export const paytmBank: Bank = {
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
}
