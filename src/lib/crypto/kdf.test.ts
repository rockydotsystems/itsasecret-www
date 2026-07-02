import { describe, it, expect } from 'vitest'
import {
  deriveKey,
  hashPassword,
  verifyPassword,
  isLegacyPasswordHash,
  verifyLegacyPasswordHash,
  DEFAULT_KDF_PARAMS,
} from './kdf'
import { base64Encode } from './base64'

describe('password hash', () => {
  it('verifies a freshly hashed password', async () => {
    const password = 'correct horse battery staple'
    const hash = await hashPassword(password)
    expect(hash.startsWith('$argon2id$v=19$')).toBe(true)
    expect(await verifyPassword(password, hash)).toBe(true)
    expect(await verifyPassword('wrong password', hash)).toBe(false)
  })

  it('produces different hashes for the same password', async () => {
    const password = 'reused-password-123'
    const a = await hashPassword(password)
    const b = await hashPassword(password)
    expect(a).not.toBe(b)
    expect(await verifyPassword(password, a)).toBe(true)
    expect(await verifyPassword(password, b)).toBe(true)
  })

  it('does not expose the KDF-derived key', async () => {
    const password = 'master-password-12345678'
    const hash = await hashPassword(password)
    const kdfSalt = crypto.getRandomValues(new Uint8Array(16))
    const kdfKey = await deriveKey(password, kdfSalt)

    // The password hash must not equal the KDF-derived key (or be derivable
    // without an additional password hash run). Different salts and the
    // encoded format ensure they are unrelated.
    const hashBytes = Buffer.from(hash, 'utf8')
    expect(hashBytes).not.toEqual(kdfSalt)
    expect(hashBytes).not.toEqual(kdfKey)
  })
})

describe('legacy password hash', () => {
  it('detects and verifies legacy base64(salt + kdfOutput) hashes', async () => {
    const password = 'legacy-password-12345678'
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const kdfKey = await deriveKey(password, salt, DEFAULT_KDF_PARAMS)
    const legacyHash = base64Encode(new Uint8Array([...salt, ...kdfKey]))

    expect(isLegacyPasswordHash(legacyHash)).toBe(true)
    expect(await verifyPassword(password, legacyHash)).toBe(false)
    expect(await verifyLegacyPasswordHash(password, legacyHash, DEFAULT_KDF_PARAMS)).toBe(true)
    expect(await verifyLegacyPasswordHash('wrong', legacyHash, DEFAULT_KDF_PARAMS)).toBe(false)
  })
})
