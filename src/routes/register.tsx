import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { useState, useEffect, useRef } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LogoMark } from '~/components/logo'
import { LoadingDots } from '~/components/loadingdots'
import { IconUser } from 'nucleo-pixel-essential'
import { submitAuthForm, getRedirectPath } from '~/lib/auth-form'
import { requireGuestBeforeLoad } from '~/lib/route-guards'

const registerSearchSchema = z.object({
  redirect: z.string().optional(),
  // Prefill for the email field, set by the /invite accept page. Invites are
  // bound to the invited address, so registering with it matters.
  email: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/register')({
  validateSearch: registerSearchSchema,
  beforeLoad: requireGuestBeforeLoad,
  component: RegisterPage,
})

function RegisterPage() {
  const { redirect, email: emailPrefill } = Route.useSearch()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const redirectTo = getRedirectPath(redirect, typeof window !== 'undefined' ? window.location.origin : undefined)

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
      await submitAuthForm('/api/auth/register', email, password)
      window.location.href = redirectTo
    } catch (err) {
      setError('Error: ' + ((err as Error).message || 'unknown'))
    } finally {
      setLoading(false)
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
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">Your master password encrypts your secrets. We can't recover it for you.</p>

        <form id="register-form" ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Input name="email" type="email" label="Email" placeholder="you@example.com" value={emailPrefill} required />
          <Input
            name="password"
            type="password"
            label="Master password"
            placeholder="At least 12 characters"
            helperText="This password encrypts your encryption key. Choose carefully."
            required
          />
          <span data-auth-form-error className="input-error">{error}</span>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? <LoadingDots /> : (
              <>
                <IconUser size={16} aria-hidden="true" />
                Create account
              </>
            )}
          </Button>
        </form>

        <p className="auth-footer">
          Already have an account? <a href="/login">Log in</a>
        </p>
      </div>
      <script
        type="module"
        dangerouslySetInnerHTML={{
          __html: `
            import { storeAuthFormNativeListener } from '/src/lib/auth-form.ts';
            storeAuthFormNativeListener('register-form', '/api/auth/register', '/dashboard');
          `,
        }}
      />
    </div>
  )
}
