import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { useState, useEffect, useRef } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LogoMark } from '~/components/logo'
import { LoadingDots } from '~/components/loadingdots'
import { IconUser } from 'nucleo-pixel-essential'
import { submitAuthForm, getRedirectPath, enrollDevice, RecoveryRequiredError } from '~/lib/auth-form'
import { requireGuestBeforeLoad } from '~/lib/route-guards'

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
  // Prefill for the email field, set by the /invite accept page.
  email: z.string().optional().catch(undefined),
  // Set by GET /api/auth/verify-email: 1 = verified, 0 = bad/expired link.
  // The router JSON-parses search values, so `?verified=1` arrives as the
  // number 1; junk values must not error the page, hence the catch.
  verified: z.union([z.literal(1), z.literal(0)]).optional().catch(undefined),
})

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  beforeLoad: requireGuestBeforeLoad,
  component: LoginPage,
})

function LoginPage() {
  const { redirect, email: emailPrefill, verified } = Route.useSearch()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsRecovery, setNeedsRecovery] = useState(false)
  const [pendingCreds, setPendingCreds] = useState<{ email: string; password: string } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (formRef.current) formRef.current.dataset.reactManaged = 'true'
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    try {
      await submitAuthForm('/api/auth/login', email, password)
      window.location.href = getRedirectPath(redirect, window.location.origin)
    } catch (err) {
      if (err instanceof RecoveryRequiredError) {
        // This machine has no live device token. Show the phrase step; the
        // credentials stay in component state so after enrollment the retry
        // happens without re-typing the master password.
        setPendingCreds({ email, password })
        setNeedsRecovery(true)
        setError('')
      } else {
        setError('Error: ' + ((err as Error).message || 'unknown'))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRecoverySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!pendingCreds) return
    setLoading(true)
    setError('')
    const form = e.currentTarget
    const phrase = (form.elements.namedItem('recoveryPhrase') as HTMLInputElement).value
    try {
      await enrollDevice(pendingCreds.email, phrase)
      // Device is now trusted: retry the original login silently.
      await submitAuthForm('/api/auth/login', pendingCreds.email, pendingCreds.password)
      setPendingCreds(null)
      window.location.href = getRedirectPath(redirect, window.location.origin)
    } catch (err) {
      setError('Error: ' + ((err as Error).message || 'unknown'))
    } finally {
      setLoading(false)
    }
  }

  if (needsRecovery) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
            <LogoMark size={28} />
            <span style={{ font: '600 var(--text-xl)/var(--leading-snug) var(--font-family-display)', color: 'var(--text-primary)' }}>
              itsasecret
            </span>
          </div>
          <h1 className="auth-title">New device</h1>
          <p className="auth-subtitle">
            This machine has not signed in to your account before, or it has been a while. Enter the
            30-word recovery phrase you saved when you created your account.
          </p>
          <form onSubmit={handleRecoverySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Input
              name="recoveryPhrase"
              type="text"
              label="Recovery phrase"
              placeholder="word word word … (30 words)"
              helperText="Words can be separated by spaces or new lines; capitalization does not matter."
              required
            />
            <span data-auth-form-error className="input-error">{error}</span>
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? <LoadingDots /> : 'Verify and sign in'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setNeedsRecovery(false); setPendingCreds(null); setError('') }}>
              Back
            </Button>
          </form>
        </div>
      </div>
    )
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
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Enter your master password to decrypt your vault.</p>

        {verified === 1 && (
          <div className="auth-banner auth-banner-success">
            Email verified - log in to finish setting up your workspace.
          </div>
        )}
        {verified === 0 && (
          <div className="auth-banner auth-banner-danger">
            That verification link is invalid or has expired. Log in to request a new one.
          </div>
        )}

        <form id="login-form" ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Input name="email" type="email" label="Email" placeholder="you@example.com" value={emailPrefill} required />
          <Input name="password" type="password" label="Master password" placeholder="••••••••••••" required />
          <span data-auth-form-error className="input-error">{error}</span>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? <LoadingDots /> : (
              <>
                <IconUser size={16} aria-hidden="true" />
                Log in
              </>
            )}
          </Button>
        </form>

        <p className="auth-footer">
          No account? <a href="/register">Create one</a>
        </p>
      </div>
      <script
        type="module"
        dangerouslySetInnerHTML={{
          __html: `
            import { storeAuthFormNativeListener } from '/src/lib/auth-form.ts';
            storeAuthFormNativeListener('login-form', '/api/auth/login', '/dashboard');
          `,
        }}
      />
    </div>
  )
}
