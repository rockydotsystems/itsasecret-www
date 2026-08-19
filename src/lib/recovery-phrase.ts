import { argon2idAsync } from '@noble/hashes/argon2.js'
import { base64Encode, base64Decode } from './crypto/base64'
import { WORDLIST } from './crypto/wordlist'

// A recovery phrase is the device-trust second factor: 30 random words drawn
// from the EFF large wordlist (~387 bits). It is generated server-side at
// signup, shown exactly once, and verified against an Argon2id hash stored on
// the user row. It never wraps keys and never changes the master key, so it
// cannot resurrect lost secrets - it proves identity for device enrollment.
export const RECOVERY_PHRASE_WORDS = 30

export function generateRecoveryPhrase(): string {
  const words: string[] = []
  const max = WORDLIST.length
  // 16-bit rejection sampling would be fine too, but 4 random bytes per word
  // keeps the modulo bias below 1 part in 500k and is simpler to review.
  for (let i = 0; i < RECOVERY_PHRASE_WORDS; i++) {
    const buf = crypto.getRandomValues(new Uint32Array(1))
    words.push(WORDLIST[buf[0] % max])
  }
  return words.join(' ')
}

// Normalization is part of the protocol: two spellings of the same phrase must
// verify identically. Lowercase, trim, collapse all whitespace (spaces, tabs,
// newlines) to single spaces. Anything stricter (diacritic folding) would be
// over-engineering for an all-lowercase-alpha wordlist.
export function normalizeRecoveryPhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(' ')
}

const ARGON2ID_ENCODED_PREFIX = '$argon2id$v=19$'

// Deliberately cheaper than the master-key KDF: phrase verification happens
// on the device-enrollment hot path and the phrase carries ~387 bits of
// entropy - unlike passwords, online guessing against the verifier is already
// bounded by the per-IP and per-account rate limits, not by KDF cost.
const PHRASE_KDF_PARAMS = { m: 19456, t: 2, p: 1 }

export async function hashRecoveryPhrase(phrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await argon2idAsync(normalizeRecoveryPhrase(phrase), salt, {
    t: PHRASE_KDF_PARAMS.t,
    m: PHRASE_KDF_PARAMS.m,
    p: PHRASE_KDF_PARAMS.p,
    dkLen: 32,
  })
  return `${ARGON2ID_ENCODED_PREFIX}m=${PHRASE_KDF_PARAMS.m},t=${PHRASE_KDF_PARAMS.t},p=${PHRASE_KDF_PARAMS.p}$${base64Encode(salt)}$${base64Encode(hash)}`
}

export async function verifyRecoveryPhrase(phrase: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split('$')
  if (encodedHash.startsWith(ARGON2ID_ENCODED_PREFIX) && parts.length === 6) {
    const m = parseInt(parts[3].match(/m=(\d+)/)?.[1] ?? '', 10)
    const t = parseInt(parts[3].match(/t=(\d+)/)?.[1] ?? '', 10)
    const p = parseInt(parts[3].match(/p=(\d+)/)?.[1] ?? '', 10)
    // Same DoS clamp as verifyPassword: a DB-write attacker must not be able
    // to plant absurd KDF params to hang the enrollment path.
    if (m && t && p && m <= 1_073_741_824 && t <= 100 && p <= 16) {
      try {
        const salt = base64Decode(parts[4])
        const expected = base64Decode(parts[5])
        const actual = await argon2idAsync(normalizeRecoveryPhrase(phrase), salt, { t, m, p, dkLen: 32 })
        return constantTimeEqual(actual, expected)
      } catch {
        // Malformed salt/hash bytes must reject, not crash the login path.
        return false
      }
    }
  }
  return false
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}
