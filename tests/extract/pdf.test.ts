import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ParseError } from '@/types'

/**
 * Shared mock state for the faked `pdfjs-dist` legacy build. Configured per
 * test to drive each branch of `extractPdfPages` without real PDF binaries.
 */
type TextItem = { str?: string; transform: number[] }

const state = vi.hoisted(() => ({
  mode: 'success' as
    | 'success'
    | 'reject-password'
    | 'reject-password-exception'
    | 'reject-generic'
    | 'reject-nonerror'
    | 'onpassword',
  onPasswordReason: 1,
  numPages: 1,
  items: [] as TextItem[],
  workerSrc: '' as string,
  throwOnSetWorker: false,
}))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => {
  const GlobalWorkerOptions = {
    get workerSrc() {
      return state.workerSrc
    },
    set workerSrc(value: string) {
      if (state.throwOnSetWorker) throw new Error('cannot set worker src')
      state.workerSrc = value
    },
  }

  function getDocument(_opts: { data: Uint8Array; password?: string }) {
    const task: {
      onPassword?: (cb: unknown, reason: number) => void
      destroy: () => void
      promise: Promise<unknown>
    } = {
      onPassword: undefined,
      destroy: () => undefined,
      get promise() {
        if (state.mode === 'onpassword' && task.onPassword) {
          // Real pdfjs calls onPassword instead of rejecting in worker mode.
          task.onPassword(() => undefined, state.onPasswordReason)
        }
        if (state.mode === 'reject-password') {
          return Promise.reject(new Error('Incorrect password supplied'))
        }
        if (state.mode === 'reject-password-exception') {
          const e = new Error('locked')
          e.name = 'PasswordException'
          return Promise.reject(e)
        }
        if (state.mode === 'reject-generic') {
          return Promise.reject(new Error('corrupt stream'))
        }
        if (state.mode === 'reject-nonerror') {
          // eslint-disable-next-line prefer-promise-reject-errors
          return Promise.reject('string failure')
        }
        return Promise.resolve({
          numPages: state.numPages,
          getPage: () =>
            Promise.resolve({
              getTextContent: () => Promise.resolve({ items: state.items }),
            }),
        })
      },
    }
    return task
  }

  return { GlobalWorkerOptions, getDocument }
})

async function importExtract() {
  return import('@/extract/pdf')
}

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3, 4])], 'statement.pdf', {
    type: 'application/pdf',
  })
}

beforeEach(() => {
  state.mode = 'success'
  state.onPasswordReason = 1
  state.numPages = 1
  state.items = []
  state.workerSrc = ''
  state.throwOnSetWorker = false
  vi.unstubAllGlobals()
})

describe('extractPdfPages', () => {
  it('groups text items into lines by vertical position', async () => {
    state.items = [
      { str: '', transform: [0, 0, 0, 0, 0, 100] }, // empty line buffer, lastY=100
      { transform: [0, 0, 0, 0, 0, 100] }, // no `str` → skipped
      { str: 'Hello', transform: [0, 0, 0, 0, 0, 100] }, // same line
      { str: 'World', transform: [0, 0, 0, 0, 0, 80] }, // new line → push "Hello"
      { str: '   ', transform: [0, 0, 0, 0, 0, 60] }, // new line → push "World"
      { str: 'Tail', transform: [0, 0, 0, 0, 0, 40] }, // whitespace buffer not pushed
    ]
    const { extractPdfPages } = await importExtract()
    const result = await extractPdfPages(makeFile())
    expect(result.kind).toBe('pdf')
    expect(result.name).toBe('statement.pdf')
    expect(result.pages).toEqual([['Hello', 'World', 'Tail']])
  })

  it('drops a trailing whitespace-only line buffer at the end of a page', async () => {
    state.items = [
      { str: 'First', transform: [0, 0, 0, 0, 0, 100] },
      { str: '   ', transform: [0, 0, 0, 0, 0, 80] }, // new line → push "First"; buffer stays whitespace
    ]
    const { extractPdfPages } = await importExtract()
    const result = await extractPdfPages(makeFile())
    expect(result.pages).toEqual([['First']])
  })

  it('passes a supplied password through to pdfjs', async () => {
    state.items = [{ str: 'Line', transform: [0, 0, 0, 0, 0, 100] }]
    const { extractPdfPages } = await importExtract()
    const result = await extractPdfPages(makeFile(), 'secret')
    expect(result.pages).toEqual([['Line']])
  })

  it('maps a password-mentioning error to password-required', async () => {
    state.mode = 'reject-password'
    const { extractPdfPages } = await importExtract()
    await expect(extractPdfPages(makeFile())).rejects.toMatchObject({
      kind: 'password-required',
    })
  })

  it('maps a PasswordException to password-required', async () => {
    state.mode = 'reject-password-exception'
    const { extractPdfPages } = await importExtract()
    await expect(extractPdfPages(makeFile())).rejects.toMatchObject({
      kind: 'password-required',
    })
  })

  it('maps a generic failure to extraction-failed', async () => {
    state.mode = 'reject-generic'
    const { extractPdfPages } = await importExtract()
    await expect(extractPdfPages(makeFile())).rejects.toMatchObject({
      kind: 'extraction-failed',
    })
  })

  it('maps a non-Error rejection to extraction-failed', async () => {
    state.mode = 'reject-nonerror'
    const { extractPdfPages } = await importExtract()
    await expect(extractPdfPages(makeFile())).rejects.toMatchObject({
      kind: 'extraction-failed',
    })
  })

  it('handles the onPassword callback (NEED_PASSWORD)', async () => {
    state.mode = 'onpassword'
    state.onPasswordReason = 1
    const { extractPdfPages } = await importExtract()
    await expect(extractPdfPages(makeFile())).rejects.toMatchObject({
      kind: 'password-required',
    })
  })

  it('handles the onPassword callback (INCORRECT_PASSWORD)', async () => {
    state.mode = 'onpassword'
    state.onPasswordReason = 2
    const { extractPdfPages } = await importExtract()
    await expect(extractPdfPages(makeFile())).rejects.toMatchObject({
      kind: 'password-required',
    })
  })

  it('configures the worker source in a browser-like environment', async () => {
    vi.stubGlobal('document', {})
    state.items = [{ str: 'Browser', transform: [0, 0, 0, 0, 0, 100] }]
    const { extractPdfPages } = await importExtract()
    const result = await extractPdfPages(makeFile())
    expect(result.pages).toEqual([['Browser']])
    expect(state.workerSrc).not.toBe('')
  })

  it('swallows errors while setting the worker source', async () => {
    vi.stubGlobal('document', {})
    state.throwOnSetWorker = true
    state.items = [{ str: 'Safe', transform: [0, 0, 0, 0, 0, 100] }]
    const { extractPdfPages } = await importExtract()
    const result = await extractPdfPages(makeFile())
    expect(result.pages).toEqual([['Safe']])
  })
})
