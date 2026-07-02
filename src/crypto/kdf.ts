import { argon2id, argon2Verify } from 'hash-wasm';

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
  return argon2id({
    password,
    salt,
    iterations: p.t,
    parallelism: p.p,
    memorySize: p.m,
    hashLength: 32,
    outputType: 'binary',
  });
}

export async function hashPassword(
  password: string,
  salt: Uint8Array,
  params?: KdfParams
): Promise<string> {
  const p = params ?? DEFAULT_KDF_PARAMS;
  return argon2id({
    password,
    salt,
    iterations: p.t,
    parallelism: p.p,
    memorySize: p.m,
    hashLength: 32,
    outputType: 'encoded',
  });
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  return argon2Verify({ password, hash: encodedHash });
}
