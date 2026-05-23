import type { PdfFile } from '@/types'
import { ParseError } from '@/types'
import { log } from '@/log'

/**
 * Extract text from a PDF file, returning one array of lines per page.
 *
 * Used internally by `parseFile` and the email-attachment path. Also exported
 * publicly for callers that want to inspect a file before deciding to parse.
 */
export async function extractPdfPages(file: File, password?: string): Promise<PdfFile> {
  // Use the legacy build which bundles the worker inline — works in both
  // Node and browser without requiring a separate worker file.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as typeof import('pdfjs-dist')

  // In browser environments, configure the worker source so pdfjs can
  // offload parsing to a Web Worker. Without this, getDocument() hangs
  // or throws in Vite-served pages.
  const isBrowser = typeof globalThis !== 'undefined' && 'document' in globalThis
  if (isBrowser && !pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      const workerUrl = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    } catch {
      // Node environment — worker not needed
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  let doc
  try {
    doc = await pdfjs.getDocument({ data: bytes, password: password ?? undefined }).promise
  } catch (err: unknown) {
    if (isPasswordError(err)) {
      throw new ParseError('PDF is password-protected', { kind: 'password-required', cause: toError(err) })
    }
    throw new ParseError('Failed to extract text from PDF', { kind: 'extraction-failed', cause: toError(err) })
  }

  const pages: string[][] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const lines: string[] = []
    let currentLine = ''
    let lastY: number | null = null

    for (const item of content.items) {
      if (!('str' in item)) continue
      const textItem = item as { str: string; transform: number[] }
      const y = textItem.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (currentLine.trim()) lines.push(currentLine.trim())
        currentLine = ''
      }
      currentLine += textItem.str
      lastY = y
    }
    if (currentLine.trim()) lines.push(currentLine.trim())
    pages.push(lines)
  }

  log.pdf('extracted %d pages from %s', pages.length, file.name)
  return { kind: 'pdf', name: file.name, pages }
}

function isPasswordError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('password') || err.name === 'PasswordException'
  }
  return false
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}
