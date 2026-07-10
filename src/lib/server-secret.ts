// Server-side symmetric key derived from SERVER_WRAP_SECRET. Used for data
// the server must be able to encrypt without a user key in the request
// (pending invite re-keys, env var history rows).

let serverSecretKey: Uint8Array | null = null

const PBKDF2_ITERATIONS = 100_000
const PBKDF2_SALT = new TextEncoder().encode('itsasecret-server-wrap-v1')

export async function getServerSecretKey(): Promise<Uint8Array> {
  if (serverSecretKey) return serverSecretKey
  // Refuse to boot on the insecure default in any environment that looks like
  // production. The app signals prod via APP_ENV (see .dev.vars.example), so
  // checking only NODE_ENV could leave a real deploy silently wrapping pending
  // invites and env-var history under a public constant.
  const isDev =
    process.env.APP_ENV === 'development' ||
    (process.env.NODE_ENV !== 'production' && !process.env.APP_ENV)
  if (!process.env.SERVER_WRAP_SECRET && !isDev) {
    throw new Error('SERVER_WRAP_SECRET must be set outside local development')
  }
  const secret = process.env.SERVER_WRAP_SECRET ?? 'dev-only-insecure-server-wrap-secret'
  // Derive the wrapping key with PBKDF2 instead of a bare SHA-256 digest so a
  // low-entropy SERVER_WRAP_SECRET cannot be brute-forced offline if the
  // database leaks (pending org keys and var-history values would be exposed).
  // The result is cached, so the iteration cost is paid once per process boot.
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: PBKDF2_SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  serverSecretKey = new Uint8Array(bits)
  return serverSecretKey
}
