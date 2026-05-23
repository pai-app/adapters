import { readFileSync } from 'fs'
import { join } from 'path'
import type { PdfFile, ImportData, AdapterResult } from '@/types'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

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
