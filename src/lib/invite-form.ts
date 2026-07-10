// Client-side call for the /invite accept page.

export async function acceptInvite(token: string): Promise<void> {
  // Authenticated by the HttpOnly session_token cookie (same-origin request).
  const resp = await fetch('/api/invites/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ token }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Failed to accept invitation' }))
    throw new Error(err.error || 'Failed to accept invitation')
  }
}
