// Server-side symmetric key derived from SERVER_WRAP_SECRET. Used for data
// the server must be able to encrypt without a user key in the request
// (pending invite re-keys, env var history rows).

let serverSecretKey: Uint8Array | null = null

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
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  serverSecretKey = new Uint8Array(digest)
  return serverSecretKey
}
