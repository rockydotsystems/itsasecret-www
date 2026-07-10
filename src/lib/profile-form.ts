import { seedVaultFromLogin } from './vault'

// Auth rides the HttpOnly session_token cookie, sent automatically on these
// same-origin requests - the bearer token is never in JS-readable storage.
function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' }
}

async function throwResponseError(resp: Response, fallback: string): Promise<never> {
  const err = await resp.json().catch(() => ({ error: fallback }))
  throw new Error(err.error || fallback)
}

export async function updateProfileName(name: string): Promise<string | null> {
  const resp = await fetch('/api/auth/me', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to update profile')
  const body = (await resp.json()) as { name: string | null }
  return body.name
}

// After the server swaps the password hash, KDF salt, and re-wrapped org
// keys, the master key cached at login is stale - re-seed it from the new
// password while it's in hand so secret reveal keeps working in this tab.
// Other tabs re-prompt for the master password (their cached key stops
// unwrapping); other devices are logged out by the server.
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const resp = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to change password')
  try {
    await seedVaultFromLogin(newPassword)
  } catch {
    // Best-effort - the dashboard prompts for the master password when needed.
  }
}

export async function submitFeedback(message: string): Promise<void> {
  const resp = await fetch('/api/feedback', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ message }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to send feedback')
}
