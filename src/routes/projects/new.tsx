import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LogoMark } from '~/components/logo'
import { createProject } from '~/lib/project-form'
import { getOrgsFn } from '~/lib/orgs-server'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import type { Org } from '~/lib/schema'

export const Route = createFileRoute('/projects/new')({
  beforeLoad: requireAuthBeforeLoad,
  validateSearch: (search: Record<string, unknown>): { orgId?: string } => ({
    orgId: typeof search.orgId === 'string' ? search.orgId : undefined,
  }),
  loader: async () => {
    const orgs = await getOrgsFn()
    return { orgs }
  },
  component: CreateProjectPage,
})

function CreateProjectPage() {
  const navigate = useNavigate()
  const { orgs } = Route.useLoaderData() as { orgs: Org[] }
  const { orgId: searchOrgId } = Route.useSearch()
  const org = orgs.find((o) => o.id === searchOrgId) ?? orgs[0]
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const name = (form.elements.namedItem('name') as HTMLInputElement).value

    try {
      if (!org) throw new Error('No organization selected')
      await createProject(org.id, name)
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
        <h1 className="auth-title">Create project</h1>
        <p className="auth-subtitle">Projects group the environments your secrets live in.</p>

        <form id="create-project-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Input
            label="Organization"
            value={org?.name ?? ''}
            disabled
          />
          <Input
            name="name"
            type="text"
            label="Project name"
            placeholder="e.g. acme-api"
            required
          />
          <span className="input-error">{error}</span>
          <Button type="submit" size="lg" disabled={loading || !org}>
            {loading ? '...' : 'Create project'}
          </Button>
        </form>
      </div>
    </div>
  )
}
