/**
 * Parsed file representations. Produced by `extractPdfPages` / `extractExcelSheets`
 * (internal + public helpers) and consumed by file adapters.
 */

export type FileKind = "pdf" | "excel"

export type PdfFile = {
  readonly kind: "pdf"
  readonly name: string
  /** One entry per page; each page is an array of text lines (top → bottom). */
  readonly pages: readonly (readonly string[])[]
}

export type ExcelSheet = {
  readonly name: string
  /** Row-major: one entry per row, each row an array of cell values as strings. */
  readonly rows: readonly (readonly string[])[]
}

export type ExcelFile = {
  readonly kind: "excel"
  readonly name: string
  readonly sheets: readonly ExcelSheet[]
}
