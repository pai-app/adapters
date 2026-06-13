/**
 * Shared HDFC patterns reused across savings-pdf, credit-pdf, and email adapters.
 */

import type { MailMessage } from '@/types'

/** HDFC IFSC pattern: `HDFC0` followed by 6+ digits. */
export const HDFC_IFSC_REGEX = /HDFC0\d{6,}/i

/** Matches `RTGS/NEFT IFSC` label in the statement header. */
export const HDFC_IFSC_LABEL_REGEX = /RTGS\/NEFT[\s]+IFSC/i

/** Email sender domains for HDFC Bank. */
export const HDFC_EMAIL_DOMAINS = ['hdfcbank.bank.in', 'hdfcbank.net']

/** Check whether a PDF attachment exists on the email. */
export function hasPdfAttachment(email: MailMessage): boolean {
  return email.attachments.some(
    (a) =>
      a.mimeType === 'application/pdf' ||
      a.filename.toLowerCase().endsWith('.pdf'),
  )
}
