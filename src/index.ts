// ── Bank registration (side-effect imports) ─────────────
import './banks/index'

// ── Public API ──────────────────────────────────────────
export { parseFile } from './parse-file'
export { parseEmail } from './parse-email'
export { statementEmailDomains } from './registry'
export { extractPdfPages } from './extract/pdf'
export { extractExcelSheets } from './extract/excel'

// ── Public types ────────────────────────────────────────
export type {
  ImportData,
  AccountKind,
  AccountDetails,
  TransactionDetails,
} from './types'
export type {
  PdfFile,
  ExcelFile,
  ExcelSheet,
  FileKind,
} from './types'
export type {
  MailMessage,
  MailAttachment,
} from './types'
export { ParseError } from './types'
export type { ParseErrorKind } from './types'
