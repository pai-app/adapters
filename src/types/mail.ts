/**
 * Decoupled email types. The caller (fin) maps from the Gmail API (or any
 * other provider) into these shapes at the boundary before calling `parseEmail`.
 */

export type MailAttachment = {
  readonly id: string
  readonly filename: string
  readonly mimeType: string
  readonly size: number
  /** Already-fetched raw bytes. The package never fetches attachments itself. */
  readonly bytes: Uint8Array
}

export type MailMessage = {
  readonly id: string
  readonly date: number               // ms epoch
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly body: string               // plain-text body
  readonly attachments: readonly MailAttachment[]
}
