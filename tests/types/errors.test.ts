import { describe, it, expect } from 'vitest'
import { ParseError } from '@/types'

describe('ParseError', () => {
  it('sets message, name, and kind', () => {
    const err = new ParseError('boom', { kind: 'parse-failed' })
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('boom')
    expect(err.name).toBe('ParseError')
    expect(err.kind).toBe('parse-failed')
    expect(err.cause).toBeUndefined()
  })

  it('preserves the underlying cause', () => {
    const cause = new Error('underlying')
    const err = new ParseError('wrap', { kind: 'extraction-failed', cause })
    expect(err.kind).toBe('extraction-failed')
    expect(err.cause).toBe(cause)
  })
})
