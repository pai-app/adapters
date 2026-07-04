/**
 * SBI (State Bank of India) — bank definition.
 *
 * Exported as a plain `Bank` value and collected into `BANKS` in
 * `banks/index.ts`.
 *
 * SBI mails two distinct statement PDFs:
 *  - "E-account statement for your SBI account(s)" → savings (`bank`)
 *  - "Quarterly Loan Account (EMI) Statement"      → loan
 * Both are handled as file attachments; there is no usable email body content,
 * so the offerings carry file adapters only.
 */

import type { Bank } from '@/types'
import { sbiSavingsPdfAdapter } from './bank-pdf'
import { sbiLoanPdfAdapter } from './loan-pdf'
import { SBI_EMAIL_DOMAINS } from './shared'

export const sbiBank: Bank = {
  id: 'sbi',
  emailDomains: SBI_EMAIL_DOMAINS,
  offerings: [
    {
      id: 'savings',
      kind: 'bank',
      fileAdapters: [sbiSavingsPdfAdapter],
    },
    {
      id: 'loan',
      kind: 'loan',
      fileAdapters: [sbiLoanPdfAdapter],
    },
  ],
}
