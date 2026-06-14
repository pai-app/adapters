import { readFileSync, readdirSync } from 'fs'
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

/** A discovered fixture: its `*.fixture.json` path and matching `*.expected.json`. */
export type DiscoveredFixture = {
  /** Fixtures-relative path, POSIX-style, e.g. "paytm/wallet-feb-2024". */
  readonly id: string
  readonly fixturePath: string
  readonly expectedPath: string
}

/**
 * Recursively discover every `*.fixture.json` under the fixtures directory that
 * has a sibling `*.expected.json`. Returns them sorted by id for stable output.
 */
export function discoverFixtures(): readonly DiscoveredFixture[] {
  const found: DiscoveredFixture[] = []

  const walk = (dir: string, relDir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(abs, rel)
      } else if (entry.name.endsWith('.fixture.json')) {
        const base = rel.slice(0, -'.fixture.json'.length)
        found.push({
          id: base,
          fixturePath: `${base}.fixture.json`,
          expectedPath: `${base}.expected.json`,
        })
      }
    }
  }

  walk(FIXTURES_DIR, '')
  return found.sort((a, b) => a.id.localeCompare(b.id))
}
