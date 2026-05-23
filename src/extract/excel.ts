import type { ExcelFile } from '@/types'
import { ParseError } from '@/types'
import { log } from '@/log'

/**
 * Extract sheets from an Excel file (.xls / .xlsx).
 *
 * Placeholder — full implementation will use a lightweight xlsx parser.
 * For Phase D (bank ports), all four banks use PDF; Excel support lands later.
 */
export function extractExcelSheets(_file: File): Promise<ExcelFile> {
  log.excel('excel extraction not yet implemented')
  throw new ParseError('Excel parsing is not yet supported', { kind: 'unsupported-file' })
}
