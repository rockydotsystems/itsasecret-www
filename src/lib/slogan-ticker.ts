const CIPHER_GLYPHS = '0123456789abcdefABCDEF+/=#*'

export const SLOGANS = ['run your own $#!@', "shhh don't tell anyone"] as const
export const SLOGAN_SEP = ' // '
export const REVEAL_CHARS = 38
export const TICK_MS = 100
export const MUDDLE_MS = 100

export function buildTape(slogans: readonly string[] = SLOGANS, sep = SLOGAN_SEP): string {
  if (slogans.length === 0) return ''
  return slogans.join(sep) + sep
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildCipher(length: number, seed = 0x51ed): string {
  const rand = mulberry32(seed)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CIPHER_GLYPHS[Math.floor(rand() * CIPHER_GLYPHS.length)] ?? '0'
  }
  return out
}

export type TickChar = {
  ch: string
  revealed: boolean
  gap: boolean
}

function wrap(n: number, mod: number): number {
  if (mod <= 0) return 0
  return ((n % mod) + mod) % mod
}

export function tickChars(
  tape: string,
  cipher: string,
  tick: number,
  cols: number,
  reveal = REVEAL_CHARS,
  muddleTick = 0,
): TickChar[] {
  const n = tape.length
  if (n === 0 || cols <= 0) return []
  const field = buildCipher(Math.max(cols, cipher.length), 0x51ed + muddleTick)
  const cyc = field.length
  const textOff = wrap(tick, n)
  const cipherOff = wrap(-tick, cyc)
  const window = Math.min(reveal, cols)
  const revealStart = wrap(tick, cols)

  const out: TickChar[] = []
  for (let i = 0; i < cols; i++) {
    const r = wrap(i - revealStart, cols)
    const revealed = r < window
    const gap = window > 0 && window < cols && (r === window || r === cols - 1)
    out.push({
      ch: gap ? ' ' : revealed ? (tape[(textOff + i) % n] ?? ' ') : (field[(cipherOff + i) % cyc] ?? '0'),
      revealed: revealed && !gap,
      gap,
    })
  }
  return out
}
