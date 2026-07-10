export const SESSION_COOKIE_NAME = 'session_token'

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

function isProduction(): boolean {
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
  return serializeCookie(SESSION_COOKIE_NAME, encodeURIComponent(token), {
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'Lax',
    httpOnly: true,
    secure,
  })
}

export function createClearSessionCookieHeader(secure = false): string {
  return serializeCookie(SESSION_COOKIE_NAME, '', {
    path: '/',
    maxAge: 0,
    sameSite: 'Lax',
    httpOnly: true,
    secure,
  })
}

