// ── Public (exported from package root) ──────────────────────────
export type { AccountKind, AccountDetails, TransactionDetails, ImportData } from './import-data'
export type { PdfFile, ExcelFile, ExcelSheet, FileKind } from './file'
export type { MailMessage, MailAttachment } from './mail'
export { ParseError } from './errors'
export type { ParseErrorKind } from './errors'

// ── Internal (used by adapter authors, not re-exported) ─────────
export type { AdapterResult } from './import-data'
export type { FileAdapter, EmailAdapter } from './adapter'
export type { Bank, BankOffering } from './bank'
