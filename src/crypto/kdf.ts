import { argon2idAsync } from '@noble/hashes/argon2.js';
import { base64Encode, base64Decode } from './base64';

export interface KdfParams {
  m: number;
  t: number;
  p: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  m: 65536,
  t: 3,
  p: 4,
};

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

export async function hashPassword(
  password: string,
  salt: Uint8Array,
  params?: KdfParams
): Promise<string> {
  const p = params ?? DEFAULT_KDF_PARAMS;
  const hash = await argon2idAsync(password, salt, {
    t: p.t,
    m: p.m,
    p: p.p,
    dkLen: 32,
  });
  const combined = new Uint8Array(salt.length + hash.length);
  combined.set(salt, 0);
  combined.set(hash, salt.length);
  return base64Encode(combined);
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const combined = base64Decode(encodedHash);
  const salt = combined.slice(0, 16);
  const expected = combined.slice(16);
  const derived = await deriveKey(password, salt);
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) {
    diff |= derived[i] ^ expected[i];
  }
  return diff === 0;
}
