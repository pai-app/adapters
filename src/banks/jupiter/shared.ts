/**
 * Shared Jupiter patterns reused across savings-pdf and email adapters.
 */

import type { MailMessage } from '@/types'

/** Email sender domains for Jupiter. */
export const JUPITER_EMAIL_DOMAINS = ['jupiter.money','federal.bank.in','federalbank.co.in']

/** Check whether a PDF attachment exists on the email. */
export function hasPdfAttachment(email: MailMessage): boolean {
  return email.attachments.some(
    (a) => a.mimeType === 'application/pdf' || a.filename.toLowerCase().endsWith('.pdf'),
  )
}
