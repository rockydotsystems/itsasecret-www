import { describe, it, expect } from 'vitest'
import { extractSessionToken } from './auth'

function req(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/thing', { headers })
}

describe('extractSessionToken', () => {
  it('reads a Bearer Authorization header', () => {
    expect(extractSessionToken(req({ Authorization: 'Bearer abc123' }))).toBe('abc123')
  })

  it('reads the session_token cookie when there is no Authorization header', () => {
    expect(extractSessionToken(req({ cookie: 'session_token=abc123' }))).toBe('abc123')
  })

  it('URL-decodes the cookie value (tokens are base64, encoded on Set-Cookie)', () => {
    // encodeURIComponent('a+b/c=') -> 'a%2Bb%2Fc%3D'
    expect(extractSessionToken(req({ cookie: 'session_token=a%2Bb%2Fc%3D' }))).toBe('a+b/c=')
  })

  it('prefers the Authorization header over the cookie', () => {
    expect(
      extractSessionToken(req({ Authorization: 'Bearer fromheader', cookie: 'session_token=fromcookie' }))
    ).toBe('fromheader')
  })

  it('picks session_token out of a multi-cookie header', () => {
    expect(
      extractSessionToken(req({ cookie: 'theme=dark; session_token=abc123; other=1' }))
    ).toBe('abc123')
  })

  it('ignores cookies whose name merely ends with session_token', () => {
    expect(extractSessionToken(req({ cookie: 'x_session_token=nope' }))).toBeNull()
  })

  it('returns null when neither header nor cookie is present', () => {
    expect(extractSessionToken(req({}))).toBeNull()
  })

  it('ignores a non-Bearer Authorization scheme', () => {
    expect(extractSessionToken(req({ Authorization: 'Basic abc123' }))).toBeNull()
  })
})
