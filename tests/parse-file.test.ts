import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Bank, PdfFile, ExcelFile, AdapterResult, FileAdapter, StatementSummary } from '@/types'
import { ParseError } from '@/types'

const mocks = vi.hoisted(() => ({
  banks: [] as Bank[],
  extractPdfPages: vi.fn(),
  extractExcelSheets: vi.fn(),
}))

vi.mock('@/banks', () => ({
  get BANKS() { return mocks.banks },
}))

vi.mock('@/extract/pdf', () => ({
  extractPdfPages: mocks.extractPdfPages,
}))

vi.mock('@/extract/excel', () => ({
  extractExcelSheets: mocks.extractExcelSheets,
}))

const { parseFile } = await import('@/parse-file')

const PDF: PdfFile = { kind: 'pdf', name: 'a.pdf', pages: [['x']] }
const EXCEL: ExcelFile = { kind: 'excel', name: 'a.xlsx', sheets: [] }

const STATEMENT: StatementSummary = {
  asOf: 1717200000000,
  periodStart: 1714521600000,
  periodEnd: 1717200000000,
  closingBalance: 123450,
}

const RESULT: AdapterResult = {
  account: { currency: 'INR', accountNumber: ['123'] },
  transactions: [{ date: 1, description: 'd', amount: 100 }],
}

function pdfAdapter(matches: boolean, read: () => Promise<AdapterResult> = () => Promise.resolve(RESULT)): FileAdapter {
  return { fileKind: 'pdf', isSupported: () => matches, read }
}

function bankWith(adapter: FileAdapter, id = 'bank', offeringId = 'off'): Bank {
  return { id, offerings: [{ id: offeringId, kind: 'bank', fileAdapters: [adapter] }] }
}

function pdfFileInput(name = 'statement.pdf', type = 'application/pdf'): File {
  return new File([new Uint8Array([1])], name, { type })
}

beforeEach(() => {
  mocks.banks = []
  mocks.extractPdfPages.mockReset().mockResolvedValue(PDF)
  mocks.extractExcelSheets.mockReset().mockResolvedValue(EXCEL)
})

describe('parseFile', () => {
  it('throws unsupported-file for an unknown file type', async () => {
    const file = new File([new Uint8Array([1])], 'note.txt', { type: 'text/plain' })
    await expect(parseFile(file)).rejects.toMatchObject({ kind: 'unsupported-file' })
  })

  it('falls back to the filename in the unsupported-file message when type is empty', async () => {
    const file = new File([new Uint8Array([1])], 'note.bin', { type: '' })
    await expect(parseFile(file)).rejects.toThrow('note.bin')
  })

  it('detects pdf via mime type and returns ImportData on a single match', async () => {
    mocks.banks = [bankWith(pdfAdapter(true))]
    const result = await parseFile(pdfFileInput())
    expect(result).toEqual({
      bankId: 'bank',
      offeringId: 'off',
      kind: 'bank',
      account: RESULT.account,
      transactions: RESULT.transactions,
    })
  })

  it('detects pdf via filename extension', async () => {
    mocks.banks = [bankWith(pdfAdapter(true))]
    const result = await parseFile(pdfFileInput('STMT.PDF', ''))
    expect(result?.bankId).toBe('bank')
  })

  it('returns null when no adapter matches', async () => {
    mocks.banks = [bankWith(pdfAdapter(false))]
    expect(await parseFile(pdfFileInput())).toBeNull()
  })

  it('passes the adapter statement summary through to ImportData', async () => {
    const adapter = pdfAdapter(true, () => Promise.resolve({ ...RESULT, statement: STATEMENT }))
    mocks.banks = [bankWith(adapter)]
    const result = await parseFile(pdfFileInput())
    expect(result?.statement).toEqual(STATEMENT)
  })

  it('leaves statement undefined when the adapter does not set it', async () => {
    mocks.banks = [bankWith(pdfAdapter(true))]
    const result = await parseFile(pdfFileInput())
    expect(result?.statement).toBeUndefined()
  })

  it('skips offerings without file adapters and adapters of the wrong kind', async () => {
    const excelAdapter: FileAdapter = { fileKind: 'excel', isSupported: () => true, read: () => Promise.resolve(RESULT) }
    mocks.banks = [
      { id: 'b1', offerings: [{ id: 'no-adapters', kind: 'bank' }] },
      { id: 'b2', offerings: [{ id: 'wrong-kind', kind: 'bank', fileAdapters: [excelAdapter] }] },
    ]
    expect(await parseFile(pdfFileInput())).toBeNull()
  })

  it('throws ambiguous-format when multiple adapters match', async () => {
    mocks.banks = [bankWith(pdfAdapter(true), 'b1', 'o1'), bankWith(pdfAdapter(true), 'b2', 'o2')]
    await expect(parseFile(pdfFileInput())).rejects.toMatchObject({ kind: 'ambiguous-format' })
  })

  it('routes excel files through the excel extractor', async () => {
    const excelAdapter: FileAdapter = { fileKind: 'excel', isSupported: () => true, read: () => Promise.resolve(RESULT) }
    mocks.banks = [{ id: 'xl', offerings: [{ id: 'sheet', kind: 'bank', fileAdapters: [excelAdapter] }] }]
    const file = new File([new Uint8Array([1])], 'book.xls', { type: 'application/vnd.ms-excel' })
    const result = await parseFile(file)
    expect(result?.bankId).toBe('xl')
    expect(mocks.extractExcelSheets).toHaveBeenCalled()
  })

  describe('password handling', () => {
    it('retries with the next password after a password-required error', async () => {
      mocks.extractPdfPages
        .mockReset()
        .mockRejectedValueOnce(new ParseError('locked', { kind: 'password-required' }))
        .mockRejectedValueOnce(new ParseError('locked', { kind: 'password-required' }))
        .mockResolvedValueOnce(PDF)
      mocks.banks = [bankWith(pdfAdapter(true))]
      const result = await parseFile(pdfFileInput(), ['wrong', 'right'])
      expect(result?.bankId).toBe('bank')
      expect(mocks.extractPdfPages).toHaveBeenCalledTimes(3)
    })

    it('throws password-required when every password fails', async () => {
      mocks.extractPdfPages
        .mockReset()
        .mockRejectedValue(new ParseError('locked', { kind: 'password-required' }))
      mocks.banks = [bankWith(pdfAdapter(true))]
      await expect(parseFile(pdfFileInput(), ['nope'])).rejects.toMatchObject({
        kind: 'password-required',
      })
    })

    it('rethrows non-password extraction errors immediately', async () => {
      mocks.extractPdfPages
        .mockReset()
        .mockRejectedValue(new ParseError('broken', { kind: 'extraction-failed' }))
      mocks.banks = [bankWith(pdfAdapter(true))]
      await expect(parseFile(pdfFileInput())).rejects.toMatchObject({
        kind: 'extraction-failed',
      })
    })
  })
})
