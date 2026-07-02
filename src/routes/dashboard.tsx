import { createFileRoute, Link } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { useState, useMemo } from 'react'
import { Button } from '~/components/button'
import { Avatar } from '~/components/avatar'
import { LogoMark } from '~/components/logo'
import { SecretRow } from '~/components/secretrow'
import { EnvironmentTag } from '~/components/environmenttag'
import { Select } from '~/components/select'
import { performLogout } from '~/lib/auth-form'

const SECRETS = [
  { name: 'STRIPE_SECRET_KEY', value: 'sk_live_••••••••••••••••', lastSynced: '2m ago' },
  { name: 'DATABASE_URL', value: 'postgres://••••••••••••', lastSynced: '1h ago' },
  { name: 'JWT_SIGNING_KEY', value: '-----BEGIN ••••••••', lastSynced: '3h ago' },
  { name: 'ANTHROPIC_API_KEY', value: 'sk-ant-••••••••••••', lastSynced: 'yesterday' },
]

const ENVIRONMENTS = ['production', 'staging', 'preview-pr-42']

const ORGS = [
  { value: 'personal', label: 'hackr (personal)' },
  { value: 'acme', label: 'Acme Corp' },
  { value: 'stark', label: 'Stark Industries' },
]

const PROJECTS_BY_ORG: Record<string, Array<{ value: string; label: string }>> = {
  personal: [
    { value: 'acme-api', label: 'acme-api' },
    { value: 'acme-web', label: 'acme-web' },
  ],
  acme: [
    { value: 'acme-api', label: 'acme-api' },
    { value: 'acme-web', label: 'acme-web' },
    { value: 'acme-billing', label: 'acme-billing' },
  ],
  stark: [
    { value: 'arc-reactor', label: 'arc-reactor' },
    { value: 'jarvis', label: 'jarvis' },
  ],
}


export const Route = createFileRoute('/dashboard')({
  beforeLoad: requireAuthBeforeLoad,
  component: DashboardPage,
})

function DashboardPage() {
  const [loggingOut, setLoggingOut] = useState(false)
  const [orgId, setOrgId] = useState('personal')
  const [projectId, setProjectId] = useState('acme-api')

  const projectOptions = useMemo(() => PROJECTS_BY_ORG[orgId] || [], [orgId])
  const selectedProject = projectOptions.find((p) => p.value === projectId)
  const projectName = selectedProject?.label || projectOptions[0]?.label || 'Select project'

  function handleOrgChange(nextOrgId: string) {
    setOrgId(nextOrgId)
    const projects = PROJECTS_BY_ORG[nextOrgId] || []
    setProjectId(projects[0]?.value || '')
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

            <div className="dashboard-navbar-selects">
              <Select
                value={orgId}
                options={ORGS}
                onChange={handleOrgChange}
              />
              <Select
                value={projectId}
                options={projectOptions}
                onChange={setProjectId}
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
