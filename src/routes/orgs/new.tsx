import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LogoMark } from '~/components/logo'
import { createOrganization } from '~/lib/org-form'
import { requireAuthBeforeLoad } from '~/lib/route-guards'

export const Route = createFileRoute('/orgs/new')({
  beforeLoad: requireAuthBeforeLoad,
  component: CreateOrgPage,
})

function CreateOrgPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const name = (form.elements.namedItem('name') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    try {
      await createOrganization(name, password)
      await navigate({ to: '/dashboard' })
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
        <h1 className="auth-title">Create organization</h1>
        <p className="auth-subtitle">Shared orgs let you invite teammates and collaborate on projects.</p>

        <form id="create-org-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Input
            name="name"
            type="text"
            label="Organization name"
            placeholder="e.g. Acme Engineering"
            required
          />
          <Input
            name="password"
            type="password"
            label="Master password"
            placeholder="Your master password"
            helperText="We need your master password to encrypt the new organization's key."
            required
          />
          <span className="input-error">{error}</span>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? '...' : 'Create organization'}
          </Button>
        </form>
      </div>
    </div>
  )
}
