import { readFileSync } from 'fs'
import { join } from 'path'
import type { PdfFile, ImportData, AdapterResult, MailMessage, MailAttachment } from '@/types'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

/** Build a `MailAttachment` with sensible defaults for tests. */
export function makeAttachment(over: Partial<MailAttachment> = {}): MailAttachment {
  return {
    id: 'att-1',
    filename: 'statement.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    bytes: new Uint8Array([1, 2, 3, 4]),
    ...over,
  }
}

/** Build a `MailMessage` with sensible defaults for tests. */
export function makeEmail(over: Partial<MailMessage> = {}): MailMessage {
  return {
    id: 'msg-1',
    date: 0,
    from: 'noreply@bank.example',
    to: 'me@example.com',
    subject: 'Your statement',
    body: 'body',
    attachments: [],
    ...over,
  }
}

/** Load a `.fixture.json` as a PdfFile. */
export function loadFixture(relativePath: string): PdfFile {
  const fullPath = join(FIXTURES_DIR, relativePath)
  return JSON.parse(readFileSync(fullPath, 'utf-8')) as PdfFile
}

/** Load a `.expected.json` as an ImportData. */
export function loadExpected(relativePath: string): ImportData {
  const fullPath = join(FIXTURES_DIR, relativePath)
  return JSON.parse(readFileSync(fullPath, 'utf-8')) as ImportData
}

/** Load expected as AdapterResult (without bankId/offeringId/kind wrappers). */
export function loadExpectedAdapterResult(relativePath: string): AdapterResult {
  const full = loadExpected(relativePath)
  return { account: full.account, transactions: full.transactions }
}
