import { describe, it, expect } from 'vitest'
import { parseAmountToMinor, parseAmountFloat } from '@/util/amount'

describe('parseAmountToMinor', () => {
  it('parses Indian comma format', () => {
    expect(parseAmountToMinor('1,23,456.78', 'INR')).toBe(12345678)
  })

  it('parses plain decimal', () => {
    expect(parseAmountToMinor('1234.50', 'INR')).toBe(123450)
  })

  it('parses no-decimal integer', () => {
    expect(parseAmountToMinor('5000', 'INR')).toBe(500000)
  })

  it('strips ₹ symbol', () => {
    expect(parseAmountToMinor('₹1,234.56', 'INR')).toBe(123456)
  })

  it('strips Rs. prefix', () => {
    expect(parseAmountToMinor('Rs. 1,234.56', 'INR')).toBe(123456)
  })

  it('strips Rs prefix without dot', () => {
    expect(parseAmountToMinor('Rs 1234.56', 'INR')).toBe(123456)
  })

  it('applies negative sign', () => {
    expect(parseAmountToMinor('500.00', 'INR', -1)).toBe(-50000)
  })

  it('handles JPY (zero decimal)', () => {
    expect(parseAmountToMinor('5,000', 'JPY')).toBe(5000)
  })

  it('handles BHD (three decimal)', () => {
    expect(parseAmountToMinor('1,234.567', 'BHD')).toBe(1234567)
  })

  it('throws on garbage', () => {
    expect(() => parseAmountToMinor('abc', 'INR')).toThrow('Unparseable amount')
  })
})

describe('parseAmountFloat', () => {
  it('parses Indian comma format to float', () => {
    expect(parseAmountFloat('1,23,456.78')).toBeCloseTo(123456.78)
  })

  it('strips Rs.₹ symbols', () => {
    expect(parseAmountFloat('₹1,234.50')).toBeCloseTo(1234.5)
  })

  it('throws on unparseable input', () => {
    expect(() => parseAmountFloat('not-a-number')).toThrow('Unparseable amount')
  })
})
