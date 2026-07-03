import { createFileRoute, Link } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { useState, useMemo, useRef } from 'react'
import { Button } from '~/components/button'
import { Avatar } from '~/components/avatar'
import { LogoMark } from '~/components/logo'
import { SecretRow } from '~/components/secretrow'
import { EnvironmentTag } from '~/components/environmenttag'
import { Select } from '~/components/select'
import { performLogout } from '~/lib/auth-form'
import { getDashboardStateFn, visitOrgFn, visitProjectFn, visitEnvFn } from '~/lib/orgs-server'
import type { DashboardState } from '~/lib/orgs-server'
import type { Environment, Project } from '~/lib/schema'

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

export const Route = createFileRoute('/dashboard')({
  beforeLoad: requireAuthBeforeLoad,
  loader: async (): Promise<DashboardState> => getDashboardStateFn(),
  component: DashboardPage,
})

function DashboardPage() {
  const initial = Route.useLoaderData() as DashboardState
  const [loggingOut, setLoggingOut] = useState(false)
  const [orgId, setOrgId] = useState<string>(initial.orgId)
  const [projects, setProjects] = useState<Project[]>(initial.projects)
  const [projectId, setProjectId] = useState<string>(initial.projectId)
  const [environments, setEnvironments] = useState<Environment[]>(initial.environments)
  const [envId, setEnvId] = useState<string>(initial.envId)
  const [switching, setSwitching] = useState(false)
  // Guards against out-of-order responses when switching quickly.
  const switchSeq = useRef(0)

  const orgOptions = useMemo(() => {
    return initial.orgs.map((org) => ({ value: org.id, label: org.name }))
  }, [initial.orgs])

  const projectOptions = useMemo(() => {
    return projects.map((project) => ({ value: project.id, label: project.name }))
  }, [projects])

  const selectedProject = projects.find((p) => p.id === projectId)
  const projectName = selectedProject?.name || projectOptions[0]?.label || 'Select project'

  function handleOrgChange(nextOrgId: string) {
    if (nextOrgId === orgId) return
    const seq = ++switchSeq.current
    setOrgId(nextOrgId)
    setSwitching(true)
    visitOrgFn({ data: { orgId: nextOrgId } })
      .then((state) => {
        if (seq !== switchSeq.current) return
        setProjects(state.projects)
        setProjectId(state.projectId)
        setEnvironments(state.environments)
        setEnvId(state.envId)
      })
      .catch(() => {
        if (seq !== switchSeq.current) return
        setProjects([])
        setProjectId('')
        setEnvironments([])
        setEnvId('')
      })
      .finally(() => {
        if (seq === switchSeq.current) setSwitching(false)
      })
  }

  function handleProjectChange(nextProjectId: string) {
    if (nextProjectId === projectId) return
    const seq = ++switchSeq.current
    setProjectId(nextProjectId)
    setSwitching(true)
    visitProjectFn({ data: { projectId: nextProjectId } })
      .then((state) => {
        if (seq !== switchSeq.current) return
        setEnvironments(state.environments)
        setEnvId(state.envId)
      })
      .catch(() => {
        if (seq !== switchSeq.current) return
        setEnvironments([])
        setEnvId('')
      })
      .finally(() => {
        if (seq === switchSeq.current) setSwitching(false)
      })
  }

  function handleEnvChange(nextEnvId: string) {
    if (nextEnvId === envId) return
    setEnvId(nextEnvId)
    visitEnvFn({ data: { envId: nextEnvId } }).catch(() => {
      // Recording the visit is best-effort; the selection still applies locally.
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
                disabled={switching || orgOptions.length === 0}
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
                disabled={switching || !orgId}
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
