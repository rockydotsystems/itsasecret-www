import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/button'
import { LogoMark } from '~/components/logo'
import { LoadingDots } from '~/components/loadingdots'
import { requireUnverifiedBeforeLoad } from '~/lib/route-guards'
import { performLogout } from '~/lib/auth-form'
import { IconCircleLogout, IconEnvelopeOpen } from 'nucleo-pixel-essential'

export const Route = createFileRoute('/verify-email')({
  beforeLoad: requireUnverifiedBeforeLoad,
  loader: ({ context }) => ({ email: context.user.email }),
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const { email } = Route.useLoaderData()
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function resend() {
    setStatus('sending')
    try {
      // Authenticated by the HttpOnly session_token cookie (same-origin request).
      const resp = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      setStatus(resp.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <LogoMark size={28} />
          <span style={{ font: '600 var(--text-xl)/var(--leading-snug) var(--font-family-display)', color: 'var(--text-primary)' }}>
            itsasecret
          </span>
        </div>
        <h1 className="auth-title">Verify your email</h1>
        <p className="auth-subtitle">
          We sent a verification link to <strong>{email}</strong>. Open it to unlock your account -
          the rest of the app stays locked until you do.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
          <Button size="lg" disabled={status === 'sending'} onClick={resend}>
            {status === 'sending' ? <LoadingDots /> : (
              <>
                <IconEnvelopeOpen size={16} aria-hidden="true" />
                Resend verification email
              </>
            )}
          </Button>
          {status === 'sent' && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Sent. Check your inbox (or the server terminal in dev).
            </span>
          )}
          {status === 'error' && (
            <span className="input-error">Couldn't resend right now. Try again shortly.</span>
          )}
          <Button size="lg" variant="secondary" onClick={() => void performLogout()}>
            <IconCircleLogout size={16} aria-hidden="true" />
            Log out
          </Button>
        </div>

        <p className="auth-footer">
          Already verified? <a href="/dashboard">Continue to your dashboard</a>
        </p>
      </div>
    </div>
  )
}
