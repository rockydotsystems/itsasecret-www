import { base64Encode, base64Decode } from './base64';

export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: CryptoKey }> {
  const result = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
  if (!('privateKey' in result)) {
    throw new Error('Expected CryptoKeyPair from generateKey');
  }
  const publicKeyBytes = await crypto.subtle.exportKey('raw', result.publicKey) as ArrayBuffer;
  return {
    publicKey: base64Encode(new Uint8Array(publicKeyBytes)),
    privateKey: result.privateKey,
  };
}

export async function deriveSessionKey(
  privateKey: CryptoKey,
  peerPublicKey: string
): Promise<Uint8Array> {
  const peerKeyBytes = base64Decode(peerPublicKey);
  const peerPubKey = await crypto.subtle.importKey(
    'raw',
    peerKeyBytes as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPubKey } as AlgorithmIdentifier,
    privateKey,
    256
  );
  const ikmKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  const sessionKeyBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('itsasecret-session-v1') },
    ikmKey,
    256
  );
  return new Uint8Array(sessionKeyBits);
}
