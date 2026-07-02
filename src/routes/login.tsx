import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { useState } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LogoMark } from '~/components/logo'
import { submitAuthForm, getRedirectPath } from '~/lib/auth-form'
import { requireGuestBeforeLoad } from '~/lib/route-guards'

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  beforeLoad: requireGuestBeforeLoad,
  component: LoginPage,
})

function LoginPage() {
  const { redirect } = Route.useSearch()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const redirectTo = getRedirectPath(redirect, typeof window !== 'undefined' ? window.location.origin : undefined)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    try {
      await submitAuthForm('/api/auth/login', email, password)
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
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Enter your master password to decrypt your vault.</p>

        <form id="login-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Input name="email" type="email" label="Email" placeholder="you@example.com" required />
          <Input name="password" type="password" label="Master password" placeholder="••••••••••••" required />
          <span data-auth-form-error className="input-error">{error}</span>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? '...' : 'Log in'}
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
