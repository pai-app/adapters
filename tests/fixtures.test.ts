import { describe, it, expect } from 'vitest'
import type { FileAdapter, PdfFile } from '@/types'
import { BANKS } from '@/banks'
import { discoverFixtures, loadFixture, loadExpected } from './helpers'

/**
 * Data-driven fixture suite.
 *
 * Every `*.fixture.json` (with a sibling `*.expected.json`) under `fixtures/`
 * is discovered automatically and validated end-to-end:
 *
 * 1. Exactly one registered PDF file adapter's `isSupported` matches it
 *    (mirrors `parseFile`'s routing — 0 or >1 matches is a bug).
 * 2. The matched bank/offering equals the `bankId`/`offeringId`/`kind` recorded
 *    in the expected output.
 * 3. The adapter's `read` output deep-equals the expected `account` +
 *    `transactions`.
 *
 * Adding a fixture pair is enough to get it covered — no per-file test needed.
 */

type PdfAdapterEntry = {
  readonly bankId: string
  readonly offeringId: string
  readonly kind: string
  readonly adapter: FileAdapter
}

const pdfAdapters: readonly PdfAdapterEntry[] = BANKS.flatMap((bank) =>
  bank.offerings.flatMap((offering) =>
    (offering.fileAdapters ?? [])
      .filter((a) => a.fileKind === 'pdf')
      .map((adapter) => ({
        bankId: bank.id,
        offeringId: offering.id,
        kind: offering.kind,
        adapter,
      })),
  ),
)

const fixtures = discoverFixtures()

describe('fixtures (data-driven)', () => {
  it('discovers at least one fixture', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  describe.each(fixtures.map((f) => [f.id, f] as const))('%s', (_id, f) => {
    const fixture: PdfFile = loadFixture(f.fixturePath)
    const expected = loadExpected(f.expectedPath)

    const matches = pdfAdapters.filter((e) => e.adapter.isSupported(fixture))

    it('is matched by exactly one PDF adapter', () => {
      expect(
        matches.map((m) => `${m.bankId}/${m.offeringId}`),
      ).toHaveLength(1)
    })

    it('is rejected by every other bank/offering adapter', () => {
      const expectedId = `${expected.bankId}/${expected.offeringId}`
      const wronglyAccepted = pdfAdapters
        .filter((e) => `${e.bankId}/${e.offeringId}` !== expectedId)
        .filter((e) => e.adapter.isSupported(fixture))
        .map((e) => `${e.bankId}/${e.offeringId}`)
      expect(wronglyAccepted).toEqual([])
    })

    it('routes to the bank/offering/kind recorded in expected', () => {
      const m = matches[0]
      expect(m).toBeDefined()
      expect({ bankId: m.bankId, offeringId: m.offeringId, kind: m.kind }).toEqual({
        bankId: expected.bankId,
        offeringId: expected.offeringId,
        kind: expected.kind,
      })
    })

    it('produces the expected account + transactions', async () => {
      const m = matches[0]
      expect(m).toBeDefined()
      const result = await m.adapter.read(fixture)
      expect(result).toEqual({
        account: expected.account,
        transactions: expected.transactions,
      })
    })
  })
})
