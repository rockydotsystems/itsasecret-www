import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LogoMark } from '~/components/logo'
import { submitAuthForm } from '~/lib/auth-form'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    try {
      await submitAuthForm('/api/auth/register', email, password)
      navigate({ to: '/dashboard' })
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

        <form id="register-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Input name="email" type="email" label="Email" placeholder="you@example.com" required />
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
            {loading ? '...' : 'Create account'}
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
