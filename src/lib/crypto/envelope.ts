import { base64Encode, base64Decode } from './base64';

export function generateKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function encrypt(key: Uint8Array, plaintext: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(nonce.length + ciphertext.byteLength);
  combined.set(nonce, 0);
  combined.set(new Uint8Array(ciphertext), nonce.length);
  return base64Encode(combined);
}

export async function decrypt(key: Uint8Array, encoded: string): Promise<string> {
  const combined = base64Decode(encoded);
  const nonce = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

export async function wrapKey(
  wrappingKey: Uint8Array,
  keyToWrap: Uint8Array
): Promise<string> {
  return encrypt(wrappingKey, base64Encode(keyToWrap));
}

export async function unwrapKey(
  wrappingKey: Uint8Array,
  wrappedKey: string
): Promise<Uint8Array> {
  const plaintext = await decrypt(wrappingKey, wrappedKey);
  return base64Decode(plaintext);
}
