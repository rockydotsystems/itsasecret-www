import { describe, it, expect } from 'vitest'
import { displayName, hasWordCharacter, hasNoControlChars } from './validation'

describe('displayName', () => {
  it('accepts ordinary names, including non-ASCII letters and digits', () => {
    expect(displayName().parse('Ada Lovelace')).toBe('Ada Lovelace')
    expect(displayName().parse('production')).toBe('production')
    expect(displayName().parse('项羽')).toBe('项羽')
    expect(displayName().parse("O'Brien-Smith, IV")).toBe("O'Brien-Smith, IV")
    expect(displayName().parse('42')).toBe('42')
  })

  it('trims surrounding whitespace', () => {
    expect(displayName().parse('  staging  ')).toBe('staging')
  })

  it('rejects empty / whitespace-only names', () => {
    expect(displayName().safeParse('').success).toBe(false)
    expect(displayName().safeParse('   ').success).toBe(false)
  })

  it('rejects symbol-only names like "*"', () => {
    expect(displayName().safeParse('*').success).toBe(false)
    expect(displayName().safeParse('---').success).toBe(false)
    expect(displayName().safeParse('🚀').success).toBe(false)
  })

  it('rejects control characters (newlines, tabs)', () => {
    expect(displayName().safeParse('foo\nbar').success).toBe(false)
    expect(displayName().safeParse('a\tb').success).toBe(false)
  })

  it('enforces the length bound', () => {
    expect(displayName().safeParse('a'.repeat(101)).success).toBe(false)
    expect(displayName(64).safeParse('a'.repeat(65)).success).toBe(false)
    expect(displayName(64).safeParse('a'.repeat(64)).success).toBe(true)
  })

  it('chains with .optional()', () => {
    expect(displayName().optional().parse(undefined)).toBeUndefined()
    expect(() => displayName().optional().parse('*')).toThrow()
  })
})

describe('predicates', () => {
  it('hasWordCharacter', () => {
    expect(hasWordCharacter('x')).toBe(true)
    expect(hasWordCharacter('5')).toBe(true)
    expect(hasWordCharacter('*')).toBe(false)
  })

  it('hasNoControlChars', () => {
    expect(hasNoControlChars('hello')).toBe(true)
    expect(hasNoControlChars('a\nb')).toBe(false)
    expect(hasNoControlChars('a\0b')).toBe(false)
  })
})
