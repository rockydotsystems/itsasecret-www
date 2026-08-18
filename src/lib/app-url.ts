import { isProduction } from './session-cookie'

// Public origin for links that get emailed out (verification, invites).
// APP_URL must be set in production: deriving the origin from the request
// would let an attacker-controlled Host header shape the links and steal
// the tokens they carry.
export function publicBaseUrl(request: Request): string {
  const baseUrl = process.env.APP_URL ?? (isProduction() ? null : new URL(request.url).origin)
  if (!baseUrl) {
    throw new Error('APP_URL must be set in production so emailed links cannot be poisoned via the Host header')
  }
  return baseUrl
}
