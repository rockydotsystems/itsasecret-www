import { argon2idAsync } from '@noble/hashes/argon2.js';
import { base64Encode, base64Decode } from './base64';

export interface KdfParams {
  m: number;
  t: number;
  p: number;
}

// KDF used to derive the user's master key from their password. That master
// key wraps the per-organization shared keys, so this cost is the main
// defense against offline password cracking if the database is breached.
// Tuned to be strong but tolerable for interactive login.
export const DEFAULT_KDF_PARAMS: KdfParams = {
  m: 65536,
  t: 1,
  p: 1,
};

// Dedicated password hash used only for online authentication.
// Uses OWASP-recommended interactive parameters for Argon2id.
// It must never share output bytes with the KDF-derived key.
export const DEFAULT_PASSWORD_HASH_PARAMS: KdfParams = {
  m: 19456,
  t: 2,
  p: 1,
};

const ARGON2ID_ENCODED_PREFIX = '$argon2id$v=19$';

// Precomputed hash for a dummy password. Used to consume roughly the same
// amount of time during a failed login as a successful one, mitigating
// timing-based username enumeration.
const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$q8sMQjN9EsEjXjgPoxRPbg==$lSMh9Sqa6SLujWLCbmNdR2GiBUcO2MT7yLipXPPR9b4=';

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  params?: KdfParams
): Promise<Uint8Array> {
  const p = params ?? DEFAULT_KDF_PARAMS;
  return argon2idAsync(password, salt, {
    t: p.t,
    m: p.m,
    p: p.p,
    dkLen: 32,
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const params = DEFAULT_PASSWORD_HASH_PARAMS;
  const hash = await argon2idAsync(password, salt, {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: 32,
  });
  return `${ARGON2ID_ENCODED_PREFIX}m=${params.m},t=${params.t},p=${params.p}$${base64Encode(salt)}$${base64Encode(hash)}`;
}

export function isLegacyPasswordHash(encodedHash: string): boolean {
  return !encodedHash.startsWith(ARGON2ID_ENCODED_PREFIX);
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (!encodedHash.startsWith(ARGON2ID_ENCODED_PREFIX)) {
    return false;
  }

  const parts = encodedHash.split('$');
  if (parts.length !== 6) {
    return false;
  }

  const paramPart = parts[3];
  const saltPart = parts[4];
  const hashPart = parts[5];

  const m = parseInt(paramPart.match(/m=(\d+)/)?.[1] ?? '', 10);
  const t = parseInt(paramPart.match(/t=(\d+)/)?.[1] ?? '', 10);
  const p = parseInt(paramPart.match(/p=(\d+)/)?.[1] ?? '', 10);
  if (!m || !t || !p) {
    return false;
  }
  // Clamp parameters parsed from the stored hash to sane maxima. A DB-write
  // attacker (or a misconfigured row) could otherwise plant m=4294967295 to
  // hang the login thread on a single argon2id call (DoS). The legitimate
  // values set by hashPassword are m<=65536, t<=2, p<=1, well under these caps.
  if (m > 1_073_741_824 || t > 100 || p > 16) {
    return false;
  }

  const salt = base64Decode(saltPart);
  const expected = base64Decode(hashPart);
  const actual = await argon2idAsync(password, salt, {
    t,
    m,
    p,
    dkLen: 32,
  });

  return constantTimeEqual(actual, expected);
}

export async function runDummyPasswordHash(): Promise<boolean> {
  return verifyPassword('dummy-password', DUMMY_PASSWORD_HASH);
}

// Verifies the legacy format where password_hash was stored as base64(salt +
// kdfOutput). This is insecure because the hash reveals the KDF-derived key,
// but we keep it for migration so existing users can log in and have their
// hash upgraded to the new format.
export async function verifyLegacyPasswordHash(
  password: string,
  legacyHash: string,
  kdfParams: KdfParams
): Promise<boolean> {
  try {
    const combined = base64Decode(legacyHash);
    if (combined.length < 16) {
      return false;
    }
    const salt = combined.slice(0, 16);
    const expected = combined.slice(16);
    const actual = await deriveKey(password, salt, kdfParams);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // Fold the length check into the constant-time accumulator rather than
  // early-exiting, so the timing does not leak the length of either side.
  let diff = a.length ^ b.length;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
