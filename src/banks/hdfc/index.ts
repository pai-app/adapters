/**
 * HDFC Bank — bank definition.
 *
 * Exported as a plain `Bank` value and collected into `BANKS` in
 * `banks/index.ts`. The package's `parseFile` / `parseEmail` entry points walk
 * that static list.
 */

import type { Bank } from '@/types'
import { hdfcSavingsPdfAdapter } from './savings-pdf'
import { hdfcCreditPdfAdapter } from './credit-pdf'
import { hdfcSavingsEmailAdapter, hdfcCreditEmailAdapter } from './email'
import { HDFC_EMAIL_DOMAINS } from './shared'

export const hdfcBank: Bank = {
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
}
