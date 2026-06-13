import { describe, it, expect } from 'vitest'
import { extractExcelSheets } from '@/extract/excel'
import { ParseError } from '@/types'

describe('extractExcelSheets', () => {
  it('throws an unsupported-file ParseError (not yet implemented)', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'sheet.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    expect(() => extractExcelSheets(file)).toThrow(ParseError)
    try {
      extractExcelSheets(file)
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError)
      expect((err as ParseError).kind).toBe('unsupported-file')
    }
  })
})
