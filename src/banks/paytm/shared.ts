/**
 * Shared Paytm Payments Bank patterns reused across savings-pdf, wallet-pdf,
 * and email adapters.
 */

import type { MailMessage } from '@/types'
import { parseDate } from '@/util/date'

/** Email sender domains for Paytm Payments Bank. */
export const PAYTM_EMAIL_DOMAINS = ['paytmbank.com']

export const CURRENCY = 'INR'

/** Time line format: `10:15 AM`. */
export const TIME_REGEX = /^(\d{1,2}:\d{2})\s*(AM|PM)$/i

/** Footer patterns — lines after these are ignored on a page. */
export const SKIP_AFTER: readonly RegExp[] = [
  /^\*[\s]*Visit[\s]+Bank/i,
  /^\*[\s]*PPBL[\s]+Savings/i,
  /^This[\s]+statement[\s]+contains/i,
  /^To[\s]+view[\s]+terms/i,
  /^PPBL[\s]+Savings/i,
  /^Each[\s]+depositor/i,
  /^Need[\s]+Help/i,
  /^\*{4,}/i,
  /^Page[\s]+\d+/i,
]

/** Description noise — removed from transaction descriptions. */
export const SKIP_DESCRIPTION: readonly RegExp[] = [
  /Money (?:Sent|Received) using UPI/i,
  /Paid using your Bank Account From/i,
  /Paid using your Bank Account/i,
  /Money (?:Sent|Received) using IMPS Bank account linked to/i,
  /Money (?:Sent|Received) using IMPS/i,
  /Money (?:Sent|Received) via UPI/i,
  /Interest Received/i,
]

/** Check whether a PDF attachment exists on the email. */
export function hasPdfAttachment(email: MailMessage): boolean {
  return email.attachments.some(
    (a) => a.mimeType === 'application/pdf' || a.filename.toLowerCase().endsWith('.pdf'),
  )
}

/**
 * Parse a date line (`DD Mon YYYY`) + time line (`HH:MM AM/PM`) into a
 * ms-epoch UTC timestamp.
 */
export function parseDateTimeAmPm(dateLine: string, timeLine: string): number {
  const baseDate = parseDate(dateLine)
  const timeMatch = TIME_REGEX.exec(timeLine.trim())
  if (!timeMatch) return baseDate

  const [hourStr, minuteStr] = timeMatch[1].split(':')
  let hour = parseInt(hourStr, 10)
  const minute = parseInt(minuteStr, 10)
  const ampm = timeMatch[2].toUpperCase()
  if (ampm === 'PM' && hour !== 12) hour += 12
  else if (ampm === 'AM' && hour === 12) hour = 0

  return baseDate + hour * 3_600_000 + minute * 60_000
}
