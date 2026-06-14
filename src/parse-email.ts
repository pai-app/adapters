import type { ImportData, EmailAdapter, FileAdapter, BankOffering, Bank } from '@/types'
import { ParseError } from '@/types'
import { BANKS } from '@/banks'
import { extractPdfPages } from '@/extract/pdf'
import { extractExcelSheets } from '@/extract/excel'
import { log } from '@/log'

/**
 * Parse an email into structured import data.
 *
 * 1. Pre-filters banks by `email.from` matching `bank.emailDomains`.
 * 2. First pass: runs email-content adapters. If one yields `ImportData`, done.
 * 3. Second pass: for each attachment, extracts text and runs file adapters
 *    scoped to the surviving banks. First successful match wins.
 * 4. If neither pass yields data, returns `null`.
 *
 * `passwords` is an ordered list tried against encrypted PDF attachments.
 */
export async function parseEmail(
  email: import('@/types').MailMessage,
  passwords?: readonly string[],
): Promise<ImportData | null> {
  const survivingBanks = filterBanksByEmail(email.from)

  if (survivingBanks.length === 0) {
    log.email('no bank matched sender %s', email.from)
    return null
  }

  // ── First pass: email-content adapters ────────────────────
  //
  // Match adapters by `isSupported`, then run `read` on each. The ambiguity
  // rule applies to adapters that actually produce body content: only when
  // more than one returns `ImportData` is the email genuinely ambiguous.
  // Pass-through adapters (which return `null` to defer to their attachment)
  // are not in conflict — several banks legitimately share a sender domain
  // (e.g. a fintech and its sponsor bank both mailing from the same address),
  // and the attachment pass disambiguates them by PDF content.

  const emailMatches: { bankId: string; offering: BankOffering; adapter: EmailAdapter }[] = []

  for (const bank of survivingBanks) {
    for (const offering of bank.offerings) {
      if (!offering.emailAdapters) continue
      for (const adapter of offering.emailAdapters) {
        if (await adapter.isSupported(email)) {
          emailMatches.push({ bankId: bank.id, offering, adapter })
        }
      }
    }
  }

  const contentMatches: { bankId: string; offering: BankOffering; result: ImportData }[] = []
  for (const match of emailMatches) {
    const result = await match.adapter.read(email)
    if (result) {
      contentMatches.push({
        bankId: match.bankId,
        offering: match.offering,
        result: {
          bankId: match.bankId,
          offeringId: match.offering.id,
          kind: match.offering.kind,
          account: result.account,
          transactions: result.transactions,
        },
      })
    }
  }

  if (contentMatches.length > 1) {
    const labels = contentMatches.map((m) => `${m.bankId}/${m.offering.id}`)
    throw new ParseError(
      `Multiple email adapters matched: ${labels.join(', ')}`,
      { kind: 'ambiguous-format' },
    )
  }

  if (contentMatches.length === 1) {
    const match = contentMatches[0]
    log.email('email-content match: %s/%s', match.bankId, match.offering.id)
    return match.result
  }

  if (emailMatches.length > 0) {
    log.email('email adapters matched but produced no body content, trying attachments')
  }

  // ── Second pass: attachments → file adapters ──────────────

  for (const att of email.attachments) {
    const fileKind = detectAttachmentKind(att.mimeType, att.filename)
    if (!fileKind) continue

    let extracted
    try {
      const blob = new File([new Uint8Array(att.bytes)], att.filename, { type: att.mimeType })
      extracted = fileKind === 'pdf'
        ? await extractWithPasswords(blob, passwords)
        : await extractExcelSheets(blob)
    } catch (err) {
      if (err instanceof ParseError && err.kind === 'password-required') throw err
      log.email('skipping attachment %s: %s', att.filename, err instanceof Error ? err.message : String(err))
      continue
    }

    // Match file adapters — scoped to surviving banks only
    const fileMatches: { bankId: string; offering: BankOffering; adapter: FileAdapter }[] = []

    for (const bank of survivingBanks) {
      for (const offering of bank.offerings) {
        if (!offering.fileAdapters) continue
        for (const adapter of offering.fileAdapters) {
          if (adapter.fileKind !== fileKind) continue
          if (adapter.isSupported(extracted)) {
            fileMatches.push({ bankId: bank.id, offering, adapter })
          }
        }
      }
    }

    if (fileMatches.length > 1) {
      const labels = fileMatches.map((m) => `${m.bankId}/${m.offering.id}`)
      throw new ParseError(
        `Multiple file adapters matched attachment ${att.filename}: ${labels.join(', ')}`,
        { kind: 'ambiguous-format' },
      )
    }

    if (fileMatches.length === 1) {
      const match = fileMatches[0]
      log.email('attachment match: %s/%s (%s)', match.bankId, match.offering.id, att.filename)
      const result = await match.adapter.read(extracted)
      return {
        bankId: match.bankId,
        offeringId: match.offering.id,
        kind: match.offering.kind,
        account: result.account,
        transactions: result.transactions,
      }
    }
  }

  return null
}

function filterBanksByEmail(from: string): readonly Bank[] {
  const lower = from.toLowerCase()
  return BANKS.filter((bank) => {
    if (!bank.emailDomains?.length) return false
    return bank.emailDomains.some((domain) => lower.includes(domain.toLowerCase()))
  })
}

function detectAttachmentKind(mimeType: string, filename: string): 'pdf' | 'excel' | null {
  const type = mimeType.toLowerCase()
  const name = filename.toLowerCase()

  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    type === 'application/vnd.ms-excel' ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls')
  ) return 'excel'

  return null
}

async function extractWithPasswords(file: File, passwords?: readonly string[]) {
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

  // The candidate list always begins with `undefined`, so the loop only exits
  // here after at least one `password-required` failure set `lastError`. The
  // right-hand fallback is defensive and unreachable in practice.
  /* v8 ignore next */
  throw lastError ?? new ParseError('PDF is password-protected', { kind: 'password-required' })
}
