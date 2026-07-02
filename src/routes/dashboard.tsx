import { createFileRoute, Link } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { useState, useMemo, useEffect } from 'react'
import { Button } from '~/components/button'
import { Avatar } from '~/components/avatar'
import { LogoMark } from '~/components/logo'
import { SecretRow } from '~/components/secretrow'
import { EnvironmentTag } from '~/components/environmenttag'
import { Select } from '~/components/select'
import { performLogout } from '~/lib/auth-form'
import { getOrgsFn, getProjectsFn } from '~/lib/orgs-server'
import type { Org, Project } from '~/lib/schema'

const SECRETS = [
  { name: 'STRIPE_SECRET_KEY', value: 'sk_live_••••••••••••••••', lastSynced: '2m ago' },
  { name: 'DATABASE_URL', value: 'postgres://••••••••••••', lastSynced: '1h ago' },
  { name: 'JWT_SIGNING_KEY', value: '-----BEGIN ••••••••', lastSynced: '3h ago' },
  { name: 'ANTHROPIC_API_KEY', value: 'sk-ant-••••••••••••', lastSynced: 'yesterday' },
]

const ENVIRONMENTS = ['production', 'staging', 'preview-pr-42']

export const Route = createFileRoute('/dashboard')({
  beforeLoad: requireAuthBeforeLoad,
  loader: async () => {
    const orgs = await getOrgsFn()
    return { orgs }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { orgs: initialOrgs } = Route.useLoaderData() as { orgs: Org[] }
  const [loggingOut, setLoggingOut] = useState(false)
  const [orgId, setOrgId] = useState<string>(initialOrgs[0]?.id ?? '')
  const [projectId, setProjectId] = useState<string>('')
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)

  const orgOptions = useMemo(() => {
    return initialOrgs.map((org) => ({ value: org.id, label: org.name }))
  }, [initialOrgs])

  const projectOptions = useMemo(() => {
    return projects.map((project) => ({ value: project.id, label: project.name }))
  }, [projects])

  const selectedProject = projects.find((p) => p.id === projectId)
  const projectName = selectedProject?.name || projectOptions[0]?.label || 'Select project'

  useEffect(() => {
    if (!orgId) {
      setProjects([])
      setProjectId('')
      return
    }
    let cancelled = false
    setLoadingProjects(true)
    getProjectsFn({ data: { orgId } })
      .then((rows) => {
        if (cancelled) return
        setProjects(rows)
        setProjectId(rows[0]?.id ?? '')
      })
      .catch(() => {
        if (cancelled) return
        setProjects([])
        setProjectId('')
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false)
      })
    return () => { cancelled = true }
  }, [orgId])

  function handleOrgChange(nextOrgId: string) {
    setOrgId(nextOrgId)
  }

  async function handleLogout() {
    setLoggingOut(true)
    await performLogout()
  }

  return (
    <div className="app-shell">
      <nav className="dashboard-navbar" aria-label="Dashboard">
        <div className="dashboard-navbar-inner">
          <div className="dashboard-navbar-left">
            <Link to="/" className="dashboard-navbar-brand" aria-label="itsasecret home">
              <LogoMark size={20} />
              <span>itsasecret</span>
            </Link>

            <div className="dashboard-navbar-crumbs">
              <Select
                value={orgId}
                options={orgOptions}
                onChange={handleOrgChange}
                variant="crumb"
                disabled={orgOptions.length === 0}
              />
              <span className="dashboard-navbar-crumb-separator" aria-hidden="true">/</span>
              <Select
                value={projectId}
                options={projectOptions}
                onChange={setProjectId}
                variant="crumb"
                disabled={loadingProjects || projectOptions.length === 0}
              />
            </div>
          </div>

          <div className="dashboard-navbar-user">
            <Avatar name="Hack R" size="sm" />
            <Button
              variant="ghost"
              size="sm"
              disabled={loggingOut}
              onClick={handleLogout}
              style={{ padding: '0 8px' }}
            >
              {loggingOut ? '...' : 'Log out'}
            </Button>
          </div>
        </div>
      </nav>

      <main className="app-main">
        <div className="app-meta">
          <h1 className="app-title">{projectName}</h1>
          <span className="app-subtitle">12 secrets · synced to 3 machines · 3 environments</span>
        </div>

        <div className="app-actions">
          <div style={{ display: 'flex', gap: '8px' }}>
            {ENVIRONMENTS.map((env, i) => (
              <EnvironmentTag key={env} name={env} active={i === 0} href={`/dashboard?env=${env}`} />
            ))}
          </div>
          <Button variant="primary" size="md">Add secret</Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {SECRETS.map((s) => (
            <SecretRow key={s.name} name={s.name} value={s.value} lastSynced={s.lastSynced} />
          ))}
        </div>
      </main>
    </div>
  )
}
