// Client-side call for the /invite accept page.

export async function acceptInvite(token: string): Promise<void> {
  const sessionToken = localStorage.getItem('sessionToken')
  if (!sessionToken) throw new Error('Not authenticated')
  const resp = await fetch('/api/invites/accept', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ token }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Failed to accept invitation' }))
    throw new Error(err.error || 'Failed to accept invitation')
  }
}
