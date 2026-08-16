import { describe, it, expect } from 'vitest'
import { buildTape, buildCipher, tickChars, SLOGAN_SEP } from './slogan-ticker'

describe('buildTape', () => {
  it('joins slogans with the separator, including a trailing one so the loop is seamless', () => {
    expect(buildTape(['aa', 'bb'])).toBe(`aa${SLOGAN_SEP}bb${SLOGAN_SEP}`)
  })
})

describe('buildCipher', () => {
  it('is deterministic for a given seed', () => {
    expect(buildCipher(32, 1)).toBe(buildCipher(32, 1))
    expect(buildCipher(32, 1)).not.toBe(buildCipher(32, 2))
  })
})

describe('tickChars', () => {
  const tape = 'abcdefghij // '
  const cipher = '0123456789ABCDEF'

  it('reveals exactly 15 screen cells (or all of them when the row is shorter)', () => {
    expect(tickChars(tape, cipher, 0, 40, 15).filter((c) => c.revealed)).toHaveLength(15)
    expect(tickChars(tape, cipher, 0, 8, 15).filter((c) => c.revealed)).toHaveLength(8)
  })

  it('shifts plaintext backward one character per tick', () => {
    const a = tickChars(tape, cipher, 0, 20, 20)
    const b = tickChars(tape, cipher, 1, 20, 20)
    expect(b[0]?.ch).toBe(a[1]?.ch)
  })

  it('shifts muddle the opposite way', () => {
    const a = tickChars(tape, cipher, 0, 40, 0)
    const b = tickChars(tape, cipher, 1, 40, 0)
    expect(b[1]?.ch).toBe(a[0]?.ch)
  })

  it('walks the reveal window opposite the plaintext', () => {
    const a = tickChars(tape, cipher, 0, 40, 15)
    const b = tickChars(tape, cipher, 1, 40, 15)
    expect(a[0]?.revealed).toBe(true)
    expect(b[0]?.revealed).toBe(false)
    expect(b[1]?.revealed).toBe(true)
    expect(b[15]?.revealed).toBe(true)
    expect(b[16]?.revealed).toBe(false)
  })

  it('leaves one space between the clear window and the jumble', () => {
    const row = tickChars(tape, cipher, 0, 40, 15)
    expect(row[39]?.gap).toBe(true)
    expect(row[39]?.ch).toBe(' ')
    expect(row[0]?.revealed).toBe(true)
    expect(row[14]?.revealed).toBe(true)
    expect(row[15]?.gap).toBe(true)
    expect(row[15]?.ch).toBe(' ')
    expect(row[16]?.gap).toBe(false)
    expect(row[16]?.revealed).toBe(false)
  })

  it('rerolls muddle glyphs when muddleTick changes', () => {
    const a = tickChars(tape, cipher, 0, 40, 0, 0)
    const b = tickChars(tape, cipher, 0, 40, 0, 1)
    expect(a.map((c) => c.ch).join('')).not.toBe(b.map((c) => c.ch).join(''))
    expect(tickChars(tape, cipher, 0, 40, 0, 1).map((c) => c.ch).join('')).toBe(
      b.map((c) => c.ch).join(''),
    )
  })
})
