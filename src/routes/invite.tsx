import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { useState } from 'react'
import { Button } from '~/components/button'
import { LogoMark } from '~/components/logo'
import { LoadingDots } from '~/components/loadingdots'
import { acceptInvite } from '~/lib/invite-form'
import { performLogout } from '~/lib/auth-form'
import { getInvitePageFn } from '~/lib/invites-server'
import type { InvitePageView } from '~/lib/invites-server'

const inviteSearchSchema = z.object({
  token: z.string().optional().catch(undefined),
})

// Public accept page for emailed org invitations. Reachable logged-out on
// purpose: the invitee may not have an account yet, so the page routes them
// through login/register (with a redirect back here) before accepting.
export const Route = createFileRoute('/invite')({
  validateSearch: inviteSearchSchema,
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }): Promise<InvitePageView> => {
    if (!deps.token) return { status: 'invalid' }
    return getInvitePageFn({ data: { token: deps.token } })
  },
  component: InvitePage,
})

function InvitePage() {
  const view = Route.useLoaderData()
  const { token } = Route.useSearch()

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <LogoMark size={28} />
          <span style={{ font: '600 var(--text-xl)/var(--leading-snug) var(--font-family-display)', color: 'var(--text-primary)' }}>
            itsasecret
          </span>
        </div>
        {view.status === 'invalid' || !token ? (
          <InvalidInvite />
        ) : (
          <ValidInvite view={view} token={token} />
        )}
      </div>
    </div>
  )
}

function InvalidInvite() {
  return (
    <>
      <h1 className="auth-title">Invitation not found</h1>
      <p className="auth-subtitle">
        This invite link is invalid, revoked, or has expired. Ask an organization admin to send a new one.
      </p>
      <p className="auth-footer">
        <a href="/login">Go to login</a>
      </p>
    </>
  )
}

function ValidInvite({ view, token }: { view: Extract<InvitePageView, { status: 'valid' }>; token: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)

  const selfUrl = `/invite?token=${encodeURIComponent(token)}`
  const roleLabel = view.role === 'admin' ? 'an admin' : 'a member'

  async function handleAccept() {
    setLoading(true)
    setError('')
    try {
      await acceptInvite(token)
      setAccepted(true)
    } catch (err) {
      setError((err as Error).message || 'Failed to accept invitation')
    } finally {
      setLoading(false)
    }
  }

  if (accepted) {
    return (
      <>
        <h1 className="auth-title">You're in</h1>
        <p className="auth-subtitle">
          You've joined <strong>{view.orgName}</strong>. Your organization key finishes provisioning on
          your next login, so if secrets won't reveal yet, log out and back in.
        </p>
        <Button size="lg" onClick={() => { window.location.href = '/dashboard' }}>
          Go to dashboard
        </Button>
      </>
    )
  }

  return (
    <>
      <h1 className="auth-title">Join {view.orgName}</h1>
      <p className="auth-subtitle">
        {view.inviterEmail ?? 'An organization admin'} invited you ({view.email}) to join{' '}
        <strong>{view.orgName}</strong> as {roleLabel}.
      </p>

      {!view.viewer ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Button
            size="lg"
            onClick={() => {
              window.location.href = `/login?redirect=${encodeURIComponent(selfUrl)}&email=${encodeURIComponent(view.email)}`
            }}
          >
            Log in to accept
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              window.location.href = `/register?redirect=${encodeURIComponent(selfUrl)}&email=${encodeURIComponent(view.email)}`
            }}
          >
            Create an account
          </Button>
        </div>
      ) : view.viewer.alreadyMember ? (
        <>
          <p className="auth-subtitle">
            You're already a member of <strong>{view.orgName}</strong>.
          </p>
          <Button size="lg" onClick={() => { window.location.href = '/dashboard' }}>
            Go to dashboard
          </Button>
        </>
      ) : !view.viewer.matches ? (
        <>
          <p className="auth-subtitle">
            This invitation was sent to <strong>{view.email}</strong>, but you're signed in as{' '}
            <strong>{view.viewer.email}</strong>. Switch to the invited account to accept.
          </p>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => void performLogout(`/login?redirect=${encodeURIComponent(selfUrl)}&email=${encodeURIComponent(view.email)}`)}
          >
            Log in as {view.email}
          </Button>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {error && <span className="input-error">{error}</span>}
          <Button size="lg" disabled={loading} onClick={() => void handleAccept()}>
            {loading ? <LoadingDots /> : 'Accept invitation'}
          </Button>
        </div>
      )}
    </>
  )
}
