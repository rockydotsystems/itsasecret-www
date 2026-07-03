import { base64Decode, base64Encode } from './crypto/base64'
import { deriveSessionKey } from './crypto/ecdh'

// Derives the per-session transport key on the client from the ECDH private
// key generated at login and the server's session public key.
export async function getClientSessionKey(): Promise<Uint8Array> {
  const ecdhPrivKeyB64 = localStorage.getItem('ecdhPrivKey')
  if (!ecdhPrivKeyB64) throw new Error('Session key not available')

  const serverPubkey = localStorage.getItem('serverPubkey')
  if (!serverPubkey) throw new Error('Session key not available')

  const rawPriv = base64Decode(ecdhPrivKeyB64)
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    rawPriv as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  )
  return deriveSessionKey(privateKey, serverPubkey)
}

export function getSessionKeyHeader(sessionKey: Uint8Array): string {
  return base64Encode(sessionKey)
}
