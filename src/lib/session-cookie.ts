export const SESSION_COOKIE_NAME = '__Host-session_token'
// __Host- cookies are only settable over HTTPS (browsers reject the prefix
// without Secure), so plain-HTTP dev uses this unprefixed name instead.
export const SESSION_COOKIE_NAME_INSECURE = 'session_token'

export function sessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE_NAME : SESSION_COOKIE_NAME_INSECURE
}

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days, matches WEB_SESSION_TTL_MS

export function isProduction(): boolean {
  return process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production'
}

export function shouldSetSecureCookie(request?: Request): boolean {
  if (isProduction()) return true
  if (!request) return false
  const url = new URL(request.url)
  return request.headers.get('x-forwarded-proto') === 'https' || url.protocol === 'https:'
}

interface CookieOptions {
  path?: string
  maxAge?: number
  sameSite?: string
  httpOnly?: boolean
  secure?: boolean
}

function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${value}`]
  if (options.path) parts.push(`Path=${options.path}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

export function createSessionCookieHeader(token: string, secure = false): string {
  return serializeCookie(sessionCookieName(secure), encodeURIComponent(token), {
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'Lax',
    httpOnly: true,
    secure,
  })
}

// Clears under whichever prefix the current transport would use, so logout
// works for cookies set over both HTTP (dev) and HTTPS.
export function createClearSessionCookieHeader(secure = false): string {
  return serializeCookie(sessionCookieName(secure), '', {
    path: '/',
    maxAge: 0,
    sameSite: 'Lax',
    httpOnly: true,
    secure,
  })
}

