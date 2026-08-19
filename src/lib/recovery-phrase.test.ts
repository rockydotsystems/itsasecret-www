import { describe, it, expect } from 'vitest'
import {
  RECOVERY_PHRASE_WORDS,
  generateRecoveryPhrase,
  hashRecoveryPhrase,
  verifyRecoveryPhrase,
  normalizeRecoveryPhrase,
} from './recovery-phrase'
import { WORDLIST } from './crypto/wordlist'

describe('generateRecoveryPhrase', () => {
  it('emits exactly 30 words from the wordlist', () => {
    const phrase = generateRecoveryPhrase()
    const words = phrase.split(' ')
    expect(words).toHaveLength(RECOVERY_PHRASE_WORDS)
    const list = new Set(WORDLIST)
    for (const w of words) {
      expect(list.has(w)).toBe(true)
    }
  })

  it('is not deterministic', () => {
    expect(generateRecoveryPhrase()).not.toBe(generateRecoveryPhrase())
  })
})

describe('normalizeRecoveryPhrase', () => {
  it('collapses whitespace and case', () => {
    expect(normalizeRecoveryPhrase('  Apple\n\n Banana  cherry\t')).toBe('apple banana cherry')
    expect(normalizeRecoveryPhrase('one two')).toBe('one two')
    expect(normalizeRecoveryPhrase('')).toBe('')
  })
})

describe('recovery phrase hash', () => {
  it('verifies a freshly hashed phrase', async () => {
    const phrase = generateRecoveryPhrase()
    const hash = await hashRecoveryPhrase(phrase)
    expect(hash.startsWith('$argon2id$v=19$')).toBe(true)
    expect(await verifyRecoveryPhrase(phrase, hash)).toBe(true)
  })

  it('verifies normalized variants (case/whitespace-insensitive)', async () => {
    const phrase = generateRecoveryPhrase()
    const hash = await hashRecoveryPhrase(phrase)
    const messy = '  ' + phrase.toUpperCase().split(' ').join('\n  ') + '\t'
    expect(await verifyRecoveryPhrase(messy, hash)).toBe(true)
  })

  it('rejects wrong phrases and garbage hashes', async () => {
    const phrase = generateRecoveryPhrase()
    const hash = await hashRecoveryPhrase(phrase)
    expect(await verifyRecoveryPhrase(generateRecoveryPhrase(), hash)).toBe(false)
    expect(await verifyRecoveryPhrase(phrase, 'not-a-hash')).toBe(false)
    expect(await verifyRecoveryPhrase(phrase, '$argon2id$v=19$m=1,t=2,p=1$badsalt$badhash')).toBe(false)
  })

  it('refuses absurd KDF params (DoS clamp)', async () => {
    const phrase = generateRecoveryPhrase()
    // m parameter beyond the clamped maximum must be rejected before hashing.
    const evil = '$argon2id$v=19$m=4294967295,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
    expect(await verifyRecoveryPhrase(phrase, evil)).toBe(false)
  })
})
