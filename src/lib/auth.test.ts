import { describe, it, expect } from 'vitest'
import { extractSessionToken } from './auth'
import { SESSION_COOKIE_NAME } from './session-cookie'

function req(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/thing', { headers })
}

describe('extractSessionToken', () => {
  it('reads a Bearer Authorization header', () => {
    expect(extractSessionToken(req({ Authorization: 'Bearer abc123' }))).toBe('abc123')
  })

  it('reads the session cookie when there is no Authorization header', () => {
    expect(extractSessionToken(req({ cookie: `${SESSION_COOKIE_NAME}=abc123` }))).toBe('abc123')
  })

  it('URL-decodes the cookie value (tokens are base64, encoded on Set-Cookie)', () => {
    // encodeURIComponent('a+b/c=') -> 'a%2Bb%2Fc%3D'
    expect(extractSessionToken(req({ cookie: `${SESSION_COOKIE_NAME}=a%2Bb%2Fc%3D` }))).toBe('a+b/c=')
  })

  it('prefers the Authorization header over the cookie', () => {
    expect(
      extractSessionToken(req({ Authorization: 'Bearer fromheader', cookie: `${SESSION_COOKIE_NAME}=fromcookie` }))
    ).toBe('fromheader')
  })

  it('picks the session cookie out of a multi-cookie header', () => {
    expect(
      extractSessionToken(req({ cookie: `theme=dark; ${SESSION_COOKIE_NAME}=abc123; other=1` }))
    ).toBe('abc123')
  })

  it('ignores cookies whose name merely ends with the session cookie name', () => {
    expect(extractSessionToken(req({ cookie: `x_${SESSION_COOKIE_NAME}=nope` }))).toBeNull()
  })

  it('returns null when neither header nor cookie is present', () => {
    expect(extractSessionToken(req({}))).toBeNull()
  })

  it('ignores a non-Bearer Authorization scheme', () => {
    expect(extractSessionToken(req({ Authorization: 'Basic abc123' }))).toBeNull()
  })
})
