import { describe, it, expect } from 'vitest'
import { parseDate, parseDateTime } from '@/util/date'

describe('parseDate', () => {
  it('parses DD/MM/YYYY', () => {
    expect(parseDate('15/03/2024')).toBe(Date.UTC(2024, 2, 15))
  })

  it('parses DD/MM/YY (2-digit year)', () => {
    expect(parseDate('01/12/24')).toBe(Date.UTC(2024, 11, 1))
  })

  it('parses DD-MM-YYYY', () => {
    expect(parseDate('05-06-2023')).toBe(Date.UTC(2023, 5, 5))
  })

  it('parses DD-MM-YY', () => {
    expect(parseDate('05-06-23')).toBe(Date.UTC(2023, 5, 5))
  })

  it('parses DD Mon YYYY', () => {
    expect(parseDate('15 Jan 2024')).toBe(Date.UTC(2024, 0, 15))
  })

  it('parses DD Mon YYYY case-insensitive', () => {
    expect(parseDate('3 DEC 2023')).toBe(Date.UTC(2023, 11, 3))
  })

  it('trims whitespace', () => {
    expect(parseDate('  01/01/2024  ')).toBe(Date.UTC(2024, 0, 1))
  })

  it('throws on garbage', () => {
    expect(() => parseDate('not-a-date')).toThrow('Unparseable date')
  })

  it('throws on unknown month name', () => {
    expect(() => parseDate('15 Xyz 2024')).toThrow('Unknown month')
  })
})

describe('parseDateTime', () => {
  it('parses DD/MM/YYYY HH:mm:ss', () => {
    expect(parseDateTime('15/03/2024 14:30:45')).toBe(Date.UTC(2024, 2, 15, 14, 30, 45))
  })

  it('falls back to parseDate for date-only strings', () => {
    expect(parseDateTime('15/03/2024')).toBe(Date.UTC(2024, 2, 15))
  })
})
