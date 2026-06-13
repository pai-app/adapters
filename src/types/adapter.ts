/**
 * Internal adapter contracts. Not exported from the package — bank/adapter
 * authors use these to implement parsers.
 */

import type { AdapterResult } from './import-data'
import type { PdfFile, ExcelFile, FileKind } from './file'
import type { MailMessage } from './mail'

/**
 * Parses a single file type for one bank offering. `isSupported` is
 * synchronous — text is already in memory after extraction.
 */
export type FileAdapter = {
  readonly fileKind: FileKind
  isSupported(file: PdfFile | ExcelFile): boolean
  read(file: PdfFile | ExcelFile): Promise<AdapterResult>
}

/**
 * Parses email content (body text, not attachments) for one bank offering.
 * `isSupported` is async because it may peek at attachment metadata.
 *
 * `read` returns `null` when the heuristic matched but the body had nothing
 * usable (e.g. marketing email from a supported sender). The package then
 * falls through to the attachment path.
 */
export type EmailAdapter = {
  isSupported(email: MailMessage): Promise<boolean>
  read(email: MailMessage): Promise<AdapterResult | null>
}
