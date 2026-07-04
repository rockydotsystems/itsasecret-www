// Server-side symmetric key derived from SERVER_WRAP_SECRET. Used for data
// the server must be able to encrypt without a user key in the request
// (pending invite re-keys, env var history rows).

let serverSecretKey: Uint8Array | null = null

export async function getServerSecretKey(): Promise<Uint8Array> {
  if (serverSecretKey) return serverSecretKey
  const secret = process.env.SERVER_WRAP_SECRET ?? 'dev-only-insecure-server-wrap-secret'
  if (!process.env.SERVER_WRAP_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('SERVER_WRAP_SECRET must be set in production')
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  serverSecretKey = new Uint8Array(digest)
  return serverSecretKey
}
