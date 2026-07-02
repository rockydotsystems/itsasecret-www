import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LogoMark } from '~/components/logo'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
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
      const kp = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      )
      const rawPub = await crypto.subtle.exportKey('raw', kp.publicKey)
      const clientPubkey = btoa(String.fromCharCode(...new Uint8Array(rawPub)))

      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, clientPubkey }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }))
        setError(err.error || 'Something went wrong')
        setLoading(false)
        return
      }

      const data = await resp.json()

      const rawPriv = await crypto.subtle.exportKey('pkcs8', kp.privateKey)
      localStorage.setItem('ecdhPrivKey', btoa(String.fromCharCode(...new Uint8Array(rawPriv))))
      localStorage.setItem('sessionToken', data.token)
      localStorage.setItem('serverPubkey', data.serverPubkey)
      localStorage.setItem('orgKeys', JSON.stringify(data.orgKeys))

      navigate({ to: '/dashboard' })
    } catch (err) {
      setError('Error: ' + ((err as Error).message || 'unknown'))
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Input name="email" type="email" label="Email" placeholder="you@example.com" required />
          <Input name="password" type="password" label="Master password" placeholder="••••••••••••" required />
          {error && <span className="input-error">{error}</span>}
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? '...' : 'Log in'}
          </Button>
        </form>

        <p className="auth-footer">
          No account? <a href="/register">Create one</a>
        </p>
      </div>
    </div>
  )
}
