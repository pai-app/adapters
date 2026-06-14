import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  Bank, PdfFile, AdapterResult, EmailAdapter, FileAdapter, MailMessage, MailAttachment,
} from '@/types'
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

const { parseEmail } = await import('@/parse-email')

const PDF: PdfFile = { kind: 'pdf', name: 'a.pdf', pages: [['x']] }

const RESULT: AdapterResult = {
  account: { currency: 'INR', accountNumber: ['123'] },
  transactions: [{ date: 1, description: 'd', amount: 100 }],
}

function attachment(over: Partial<MailAttachment> = {}): MailAttachment {
  return {
    id: 'att1',
    filename: 'statement.pdf',
    mimeType: 'application/pdf',
    size: 4,
    bytes: new Uint8Array([1, 2, 3, 4]),
    ...over,
  }
}

function email(over: Partial<MailMessage> = {}): MailMessage {
  return {
    id: 'm1',
    date: 0,
    from: 'noreply@bank.example',
    to: 'me@example.com',
    subject: 'Statement',
    body: 'body',
    attachments: [],
    ...over,
  }
}

function emailAdapter(supported: boolean, read: () => Promise<AdapterResult | null>): EmailAdapter {
  return { isSupported: () => Promise.resolve(supported), read }
}

function fileAdapter(matches: boolean): FileAdapter {
  return { fileKind: 'pdf', isSupported: () => matches, read: () => Promise.resolve(RESULT) }
}

beforeEach(() => {
  mocks.banks = []
  mocks.extractPdfPages.mockReset().mockResolvedValue(PDF)
  mocks.extractExcelSheets.mockReset()
})

describe('parseEmail', () => {
  it('returns null when no bank matches the sender', async () => {
    mocks.banks = [
      { id: 'no-domains', offerings: [] }, // no emailDomains → filtered out
      { id: 'other', emailDomains: ['other.example'], offerings: [] },
    ]
    expect(await parseEmail(email({ from: 'x@bank.example' }))).toBeNull()
  })

  it('returns ImportData from an email-content adapter', async () => {
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [{ id: 'off', kind: 'bank', emailAdapters: [emailAdapter(true, () => Promise.resolve(RESULT))] }],
    }]
    const result = await parseEmail(email())
    expect(result).toEqual({
      bankId: 'bank',
      offeringId: 'off',
      kind: 'bank',
      account: RESULT.account,
      transactions: RESULT.transactions,
    })
  })

  it('throws ambiguous-format when multiple email adapters match', async () => {
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [
        { id: 'o1', kind: 'bank', emailAdapters: [emailAdapter(true, () => Promise.resolve(RESULT))] },
        { id: 'o2', kind: 'bank', emailAdapters: [emailAdapter(true, () => Promise.resolve(RESULT))] },
      ],
    }]
    await expect(parseEmail(email())).rejects.toMatchObject({ kind: 'ambiguous-format' })
  })

  it('falls through to attachments when the email adapter returns null', async () => {
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [{
        id: 'off',
        kind: 'bank',
        emailAdapters: [emailAdapter(true, () => Promise.resolve(null))],
        fileAdapters: [fileAdapter(true)],
      }],
    }]
    const result = await parseEmail(email({ attachments: [attachment()] }))
    expect(result?.bankId).toBe('bank')
  })

  it('skips offerings without email adapters during the first pass', async () => {
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [{ id: 'off', kind: 'bank', fileAdapters: [fileAdapter(true)] }],
    }]
    const result = await parseEmail(email({ attachments: [attachment()] }))
    expect(result?.bankId).toBe('bank')
  })

  it('skips email adapters whose isSupported returns false', async () => {
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [{
        id: 'off',
        kind: 'bank',
        emailAdapters: [emailAdapter(false, () => Promise.resolve(RESULT))],
        fileAdapters: [fileAdapter(false)],
      }],
    }]
    expect(await parseEmail(email({ attachments: [attachment()] }))).toBeNull()
  })

  it('matches a pdf attachment via filename extension', async () => {
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [{ id: 'off', kind: 'bank', fileAdapters: [fileAdapter(true)] }],
    }]
    const att = attachment({ mimeType: 'application/octet-stream', filename: 'doc.PDF' })
    const result = await parseEmail(email({ attachments: [att] }))
    expect(result?.offeringId).toBe('off')
  })

  it('skips attachments that are neither pdf nor excel', async () => {
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [{ id: 'off', kind: 'bank', fileAdapters: [fileAdapter(true)] }],
    }]
    const att = attachment({ mimeType: 'image/png', filename: 'logo.png' })
    expect(await parseEmail(email({ attachments: [att] }))).toBeNull()
  })

  it('routes excel attachments through the excel extractor', async () => {
    const excelAdapter: FileAdapter = {
      fileKind: 'excel', isSupported: () => true, read: () => Promise.resolve(RESULT),
    }
    mocks.extractExcelSheets.mockResolvedValue({ kind: 'excel', name: 'a.xlsx', sheets: [] })
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [{ id: 'off', kind: 'bank', fileAdapters: [excelAdapter] }],
    }]
    const att = attachment({
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'book.xlsx',
    })
    const result = await parseEmail(email({ attachments: [att] }))
    expect(result?.bankId).toBe('bank')
  })

  it('rethrows a password-required error from attachment extraction', async () => {
    mocks.extractPdfPages.mockReset().mockRejectedValue(
      new ParseError('locked', { kind: 'password-required' }),
    )
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [{ id: 'off', kind: 'bank', fileAdapters: [fileAdapter(true)] }],
    }]
    await expect(parseEmail(email({ attachments: [attachment()] }))).rejects.toMatchObject({
      kind: 'password-required',
    })
  })

  it('skips an attachment when extraction fails with a non-password error', async () => {
    mocks.extractPdfPages.mockReset()
      .mockRejectedValueOnce(new ParseError('broken', { kind: 'extraction-failed' }))
      .mockResolvedValueOnce(PDF)
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [{ id: 'off', kind: 'bank', fileAdapters: [fileAdapter(true)] }],
    }]
    const result = await parseEmail(email({
      attachments: [attachment({ id: 'a1' }), attachment({ id: 'a2' })],
    }))
    expect(result?.bankId).toBe('bank')
  })

  it('skips an attachment when extraction fails with a non-Error value', async () => {
    mocks.extractPdfPages.mockReset().mockRejectedValue('plain string failure')
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [{ id: 'off', kind: 'bank', fileAdapters: [fileAdapter(true)] }],
    }]
    expect(await parseEmail(email({ attachments: [attachment()] }))).toBeNull()
  })

  it('throws ambiguous-format when multiple file adapters match an attachment', async () => {
    mocks.banks = [
      { id: 'b1', emailDomains: ['bank.example'], offerings: [{ id: 'o1', kind: 'bank', fileAdapters: [fileAdapter(true)] }] },
      { id: 'b2', emailDomains: ['bank.example'], offerings: [{ id: 'o2', kind: 'bank', fileAdapters: [fileAdapter(true)] }] },
    ]
    await expect(parseEmail(email({ attachments: [attachment()] }))).rejects.toMatchObject({
      kind: 'ambiguous-format',
    })
  })

  it('returns null when an attachment matches no file adapter', async () => {
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [{ id: 'off', kind: 'bank', fileAdapters: [fileAdapter(false)] }],
    }]
    expect(await parseEmail(email({ attachments: [attachment()] }))).toBeNull()
  })

  it('skips offerings without file adapters and adapters of the wrong kind during attachments', async () => {
    const excelAdapter: FileAdapter = {
      fileKind: 'excel', isSupported: () => true, read: () => Promise.resolve(RESULT),
    }
    mocks.banks = [{
      id: 'bank',
      emailDomains: ['bank.example'],
      offerings: [
        { id: 'no-file', kind: 'bank' },
        { id: 'wrong-kind', kind: 'bank', fileAdapters: [excelAdapter] },
      ],
    }]
    expect(await parseEmail(email({ attachments: [attachment()] }))).toBeNull()
  })
})
