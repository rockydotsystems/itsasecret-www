import { getClientSessionKey, getSessionKeyHeader } from './client-session'

export type AccessTokenSummary = {
  id: string
  name: string
  created_at: string
  // null = does not expire
  expires_at: string | null
}

export type CreatedAccessToken = {
  id: string
  name: string
  // Full `shht_...` value; shown exactly once.
  token: string
  expiresAt: string | null
}

// Auth rides the HttpOnly session_token cookie, sent automatically on these
// same-origin requests - the bearer token is never in JS-readable storage.
function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
}

async function throwResponseError(resp: Response, fallback: string): Promise<never> {
  const err = await resp.json().catch(() => ({ error: fallback }))
  throw new Error(err.error || fallback)
}

export async function listAccessTokens(): Promise<AccessTokenSummary[]> {
  const resp = await fetch('/api/tokens', { headers: authHeaders() })
  if (!resp.ok) await throwResponseError(resp, 'Failed to load access tokens')
  const body = await resp.json()
  return body.tokens
}

// Creating a token re-wraps this session's org keys server-side, which needs
// the session transport key - same header the reveal/pull endpoints use.
export async function createAccessToken(
  name: string,
  expiresInDays: number | null
): Promise<CreatedAccessToken> {
  const sessionKey = await getClientSessionKey()
  const resp = await fetch('/api/tokens', {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'X-Session-Key': getSessionKeyHeader(sessionKey),
    },
    body: JSON.stringify({ name, expiresInDays }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to create access token')
  return resp.json()
}

export async function revokeAccessToken(tokenId: string): Promise<void> {
  const resp = await fetch(`/api/tokens/${encodeURIComponent(tokenId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to revoke access token')
}
