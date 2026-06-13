import type { ImportData, FileAdapter, BankOffering } from '@/types'
import { ParseError } from '@/types'
import { registeredBanks } from '@/registry'
import { extractPdfPages } from '@/extract/pdf'
import { extractExcelSheets } from '@/extract/excel'
import { log } from '@/log'

/**
 * Parse a file (PDF or Excel) into structured import data.
 *
 * 1. Detects file type from `file.type` / extension.
 * 2. Extracts text (via pdfjs or xlsx parser).
 * 3. Walks all registered banks → offerings → file adapters;
 *    calls `isSupported(file)` on each; collects matches.
 * 4. 0 matches → `null`. 1 match → parses. Multiple → throws `ambiguous-format`.
 *
 * `passwords` is an ordered list tried against encrypted PDFs. First one that
 * opens the file wins. If all fail, throws `password-required`.
 */
export async function parseFile(
  file: File,
  passwords?: readonly string[],
): Promise<ImportData | null> {
  const fileKind = detectFileKind(file)
  if (!fileKind) {
    throw new ParseError(
      `Unsupported file type: ${file.type || file.name}`,
      { kind: 'unsupported-file' },
    )
  }

  const extracted = fileKind === 'pdf'
    ? await extractWithPasswords(file, passwords)
    : await extractExcelSheets(file)

  const matches: { bankId: string; offering: BankOffering; adapter: FileAdapter }[] = []

  for (const bank of registeredBanks()) {
    for (const offering of bank.offerings) {
      if (!offering.fileAdapters) continue
      for (const adapter of offering.fileAdapters) {
        if (adapter.fileKind !== fileKind) continue
        if (adapter.isSupported(extracted)) {
          matches.push({ bankId: bank.id, offering, adapter })
        }
      }
    }
  }

  if (matches.length === 0) return null

  if (matches.length > 1) {
    const labels = matches.map((m) => `${m.bankId}/${m.offering.id}`)
    throw new ParseError(
      `Multiple adapters matched: ${labels.join(', ')}`,
      { kind: 'ambiguous-format' },
    )
  }

  const match = matches[0]
  log.parse('matched %s/%s', match.bankId, match.offering.id)

  const result = await match.adapter.read(extracted)
  return {
    bankId: match.bankId,
    offeringId: match.offering.id,
    kind: match.offering.kind,
    account: result.account,
    transactions: result.transactions,
  }
}

function detectFileKind(file: File): 'pdf' | 'excel' | null {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()

  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    type === 'application/vnd.ms-excel' ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls')
  ) return 'excel'

  return null
}

async function extractWithPasswords(
  file: File,
  passwords?: readonly string[],
) {
  // Try without password first
  const candidates = [undefined, ...(passwords ?? [])]
  let lastError: ParseError | undefined

  for (const pw of candidates) {
    try {
      return await extractPdfPages(file, pw)
    } catch (err) {
      if (err instanceof ParseError && err.kind === 'password-required') {
        lastError = err
        continue
      }
      throw err
    }
  }

  // All passwords exhausted
  // The candidate list always begins with `undefined`, so the loop only exits
  // here after at least one `password-required` failure set `lastError`. The
  // right-hand fallback is defensive and unreachable in practice.
  /* v8 ignore next */
  throw lastError ?? new ParseError('PDF is password-protected', { kind: 'password-required' })
}
