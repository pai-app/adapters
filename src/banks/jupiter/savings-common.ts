/**
 * Shared helpers for the Jupiter savings PDF adapter's two statement formats
 * (V1 app-download, V2 emailed). Pure, format-agnostic utilities only.
 */

export type Pages = readonly (readonly string[])[]

/** Scan all pages for the first capture group of a regex. */
export function extractMatch(pages: Pages, regex: RegExp): string | null {
  for (const page of pages) {
    for (const line of page) {
      const match = regex.exec(line)
      if (match) return match[1].trim()
    }
  }
  return null
}
