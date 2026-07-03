import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { Button } from '~/components/button'
import { Avatar } from '~/components/avatar'
import { LogoMark } from '~/components/logo'
import { SecretRow } from '~/components/secretrow'
import { EnvironmentTag } from '~/components/environmenttag'
import { Select } from '~/components/select'
import { performLogout } from '~/lib/auth-form'
import type { Environment, Org, Project } from '~/lib/schema'

const SECRETS = [
  { name: 'STRIPE_SECRET_KEY', value: 'sk_live_••••••••••••••••', lastSynced: '2m ago' },
  { name: 'DATABASE_URL', value: 'postgres://••••••••••••', lastSynced: '1h ago' },
  { name: 'JWT_SIGNING_KEY', value: '-----BEGIN ••••••••', lastSynced: '3h ago' },
  { name: 'ANTHROPIC_API_KEY', value: 'sk-ant-••••••••••••', lastSynced: 'yesterday' },
]

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export type DashboardShellProps = {
  orgs: Org[]
  orgId: string
  projects: Project[]
  projectId: string
  environments: Environment[]
  envId: string
}

export function DashboardShell({ orgs, orgId, projects, projectId, environments, envId }: DashboardShellProps) {
  const navigate = useNavigate()
  const isNavigating = useRouterState({ select: (s) => s.status === 'pending' })
  const [loggingOut, setLoggingOut] = useState(false)

  const orgOptions = useMemo(() => {
    return orgs.map((org) => ({ value: org.id, label: org.name }))
  }, [orgs])

  const projectOptions = useMemo(() => {
    return projects.map((project) => ({ value: project.id, label: project.name }))
  }, [projects])

  const projectName = projects.find((p) => p.id === projectId)?.name || 'Select project'

  function handleOrgChange(nextOrgId: string) {
    if (nextOrgId === orgId) return
    void navigate({ to: '/dashboard/$orgId', params: { orgId: nextOrgId } })
  }

  function handleProjectChange(nextProjectId: string) {
    if (nextProjectId === projectId) return
    void navigate({ to: '/dashboard/$orgId/$projectId', params: { orgId, projectId: nextProjectId } })
  }

  function handleEnvChange(nextEnvId: string) {
    if (nextEnvId === envId) return
    void navigate({
      to: '/dashboard/$orgId/$projectId',
      params: { orgId, projectId },
      search: { env: nextEnvId },
    })
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
                disabled={isNavigating || orgOptions.length === 0}
                action={
                  <Link to="/orgs/new" aria-label="Create new organization">
                    + New org
                  </Link>
                }
                optionAction={(option) => (
                  <Link
                    to="/orgs/$orgId/settings"
                    params={{ orgId: option.value }}
                    aria-label={`Settings for ${option.label}`}
                    title={`Settings for ${option.label}`}
                  >
                    <SettingsIcon />
                  </Link>
                )}
              />
              <span className="dashboard-navbar-crumb-separator" aria-hidden="true">/</span>
              <Select
                value={projectId}
                options={projectOptions}
                onChange={handleProjectChange}
                variant="crumb"
                placeholder={projectOptions.length === 0 ? 'No projects' : undefined}
                disabled={isNavigating || !orgId}
                action={
                  <Link to="/projects/new" search={{ orgId }} aria-label="Create new project">
                    + New project
                  </Link>
                }
                optionAction={(option) => (
                  <Link
                    to="/projects/$projectId/settings"
                    params={{ projectId: option.value }}
                    aria-label={`Settings for ${option.label}`}
                    title={`Settings for ${option.label}`}
                  >
                    <SettingsIcon />
                  </Link>
                )}
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
            {environments.map((env) => (
              <EnvironmentTag
                key={env.id}
                name={env.name}
                active={env.id === envId}
                onClick={() => handleEnvChange(env.id)}
              />
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
