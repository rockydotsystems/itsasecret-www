// Server-side symmetric key derived from SERVER_WRAP_SECRET. Used for data
// the server must be able to encrypt without a user key in the request
// (pending invite re-keys, env var history rows).

let serverSecretKey: Uint8Array | null = null
let legacyServerSecretKey: Uint8Array | null = null

const PBKDF2_ITERATIONS = 600_000

// Development must be signaled explicitly (APP_ENV=development) - never
// inferred from missing env vars - and even then the insecure default
// requires a separate explicit opt-in.
const isDev = process.env.APP_ENV === 'development'
const allowInsecureDevSecret = isDev && process.env.ALLOW_INSECURE_DEV_SECRET === '1'

function serverWrapSecret(): string {
  // Fail closed: without a secret there is no key, in every environment.
  if (!process.env.SERVER_WRAP_SECRET && !allowInsecureDevSecret) {
    throw new Error('SERVER_WRAP_SECRET must be set (local development may opt in with ALLOW_INSECURE_DEV_SECRET=1)')
  }
  const secret = process.env.SERVER_WRAP_SECRET ?? 'dev-only-insecure-server-wrap-secret'
  // A short or low-entropy SERVER_WRAP_SECRET is brute-forceable offline if the
  // database leaks (pending org keys and var-history values would be exposed).
  // PBKDF2 slows this down but cannot save a tiny secret. Pragmatic entropy
  // shape: >=43 base64 chars, >=64 hex chars, or >=32 raw chars - the union
  // of all three is simply 32 characters.
  if (secret.length < 32) {
    throw new Error('SERVER_WRAP_SECRET must be at least 32 characters (use a random hex/base64 string)')
  }
  return secret
}

// Derive the wrapping key with PBKDF2 instead of a bare SHA-256 digest so a
// low-entropy SERVER_WRAP_SECRET cannot be brute-forced offline if the
// database leaks (pending org keys and var-history values would be exposed).
// The result is cached, so the iteration cost is paid once per process boot.
async function deriveServerKey(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  return new Uint8Array(bits)
}

export async function getServerSecretKey(): Promise<Uint8Array> {
  if (serverSecretKey) return serverSecretKey
  const secret = serverWrapSecret()
  // v2: the salt is derived from the secret plus a domain string, so every
  // deployment derives its own salt instead of sharing a global constant.
  const salt = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${secret}:itsasecret-server-wrap-v2`) as BufferSource
  ))
  serverSecretKey = await deriveServerKey(secret, salt, PBKDF2_ITERATIONS)
  return serverSecretKey
}

// v1 derivation (fixed global salt, 100k iterations): reads only. Ciphertexts
// written before the v2 key derivation shipped would otherwise be
// undecryptable - pending org keys would strand invitees and var history
// would read as garbage. New writes always use getServerSecretKey.
export async function getLegacyServerSecretKey(): Promise<Uint8Array> {
  if (legacyServerSecretKey) return legacyServerSecretKey
  const secret = serverWrapSecret()
  const salt = new TextEncoder().encode('itsasecret-server-wrap-v1')
  legacyServerSecretKey = await deriveServerKey(secret, new Uint8Array(salt), 100_000)
  return legacyServerSecretKey
}
