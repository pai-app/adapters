/**
 * Shared Federal Bank patterns reused across credit-pdf and email adapters.
 */

import type { MailMessage } from '@/types'

/** Email sender domains for Federal Bank. */
export const FEDERAL_EMAIL_DOMAINS = ['federal.bank.in', 'federalbank.co.in']

/** Check whether a PDF attachment exists on the email. */
export function hasPdfAttachment(email: MailMessage): boolean {
  return email.attachments.some(
    (a) => a.mimeType === 'application/pdf' || a.filename.toLowerCase().endsWith('.pdf'),
  )
}
