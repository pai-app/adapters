/**
 * Jupiter (Federal Bank Fintech) — Savings/UPI Account PDF statement adapter.
 *
 * Jupiter accounts are backed by Federal Bank and have two statement formats:
 * - V1 (app-download): Federal "STATEMENT OF ACCOUNT", branded
 *   "Fintech Partnerships (Jupiter)". See `savings-v1.ts`.
 * - V2 (emailed): Federal "ACCOUNT STATEMENT", branch "NEO BANKING- JUPITER".
 *   See `savings-v2.ts`.
 *
 * Both are the same logical account via different delivery channels, so one
 * adapter handles both: `isSupported` accepts either, and `read` dispatches by
 * format marker.
 */

import type { FileAdapter, PdfFile } from '@/types'
import { readJupiterV1 } from './savings-v1'
import { readJupiterV2 } from './savings-v2'

const FINTECH_PARTNERSHIPS = /Fintech Partnerships/
const ACCOUNT_STATEMENT = /ACCOUNT STATEMENT/i
const JUPITER = /Jupiter/i

export const jupiterSavingsPdfAdapter: FileAdapter = {
  fileKind: 'pdf',

  isSupported(file) {
    const pdf = file as PdfFile
    const hasJupiter = pdf.pages.some((p) => p.some((l) => JUPITER.test(l)))
    if (!hasJupiter) return false
    // V1 marker (Fintech Partnerships) or V2 marker (ACCOUNT STATEMENT).
    return (
      pdf.pages.some((p) => p.some((l) => FINTECH_PARTNERSHIPS.test(l))) ||
      pdf.pages.some((p) => p.some((l) => ACCOUNT_STATEMENT.test(l)))
    )
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(file) {
    const pdf = file as PdfFile
    const isV1 = pdf.pages.some((p) => p.some((l) => FINTECH_PARTNERSHIPS.test(l)))
    return isV1 ? readJupiterV1(pdf.pages) : readJupiterV2(pdf.pages)
  },
}

