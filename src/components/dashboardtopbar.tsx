import { Link, useNavigate, useRouteContext } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { Button } from '~/components/button'
import { Avatar } from '~/components/avatar'
import { LogoMark } from '~/components/logo'
import { Select } from '~/components/select'
import { Modal } from '~/components/modal'
import { WorkspaceWizard } from '~/components/workspacewizard'
import { CreateProjectForm } from '~/components/createprojectform'
import { performLogout } from '~/lib/auth-form'
import { IconCircleKey, IconCircleLogout, IconGear2, IconPlus } from 'nucleo-pixel-essential'
import type { SessionUser } from '~/lib/auth-server'
import type { Org, Project } from '~/lib/schema'

function SettingsIcon() {
  return <IconGear2 size={16} aria-hidden="true" />
}

export type DashboardTopBarProps = {
  orgs: Org[]
  orgId: string
  projects: Project[]
  projectId: string
}

export function DashboardTopBar({ orgs, orgId, projects, projectId }: DashboardTopBarProps) {
  const navigate = useNavigate()
  // Every page with the top bar sits behind requireAuthBeforeLoad, which puts
  // the session user into route context - no extra fetch or prop-drilling.
  const { user } = useRouteContext({ strict: false }) as { user?: SessionUser }
  const [loggingOut, setLoggingOut] = useState(false)
  const [creating, setCreating] = useState<'org' | 'project' | null>(null)

  const currentOrg = orgs.find((o) => o.id === orgId)

  const orgOptions = useMemo(() => {
    return orgs.map((org) => ({ value: org.id, label: org.name }))
  }, [orgs])

  const projectOptions = useMemo(() => {
    return projects.map((project) => ({ value: project.id, label: project.name }))
  }, [projects])

  function handleOrgChange(nextOrgId: string) {
    if (nextOrgId === orgId) return
    void navigate({ to: '/dashboard/$orgId', params: { orgId: nextOrgId } })
  }

  function handleProjectChange(nextProjectId: string) {
    if (nextProjectId === projectId) return
    void navigate({ to: '/dashboard/$orgId/$projectId', params: { orgId, projectId: nextProjectId } })
  }

  async function handleLogout() {
    setLoggingOut(true)
    await performLogout()
  }

  return (
    <>
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
                action={
                  <button
                    type="button"
                    onClick={() => setCreating('org')}
                    aria-label="Create new organization"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <IconPlus size={12} aria-hidden="true" />
                    New org
                  </button>
                }
                optionAction={(option) => (
                  <Link
                    to="/dashboard/$orgId/settings"
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
                disabled={!orgId}
                action={
                  <button
                    type="button"
                    onClick={() => setCreating('project')}
                    aria-label="Create new project"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <IconPlus size={12} aria-hidden="true" />
                    New project
                  </button>
                }
                optionAction={(option) => (
                  <Link
                    to="/dashboard/$orgId/$projectId/settings"
                    params={{ orgId, projectId: option.value }}
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
            <Link to="/dashboard/profile" className="avatar-link" aria-label="Your profile" title="Your profile">
              <Avatar name={user?.name || user?.email || '?'} email={user?.email} size="sm" />
            </Link>
            <Button variant="ghost" size="sm" href="/dashboard/tokens" style={{ padding: '0 8px' }}>
              <IconCircleKey size={16} aria-hidden="true" />
              Tokens
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={loggingOut}
              onClick={handleLogout}
              style={{ padding: '0 8px' }}
            >
              {loggingOut ? '...' : (
                <>
                  <IconCircleLogout size={16} aria-hidden="true" />
                  Log out
                </>
              )}
            </Button>
          </div>
        </div>
      </nav>

      {creating === 'org' && (
        <Modal title="Create organization" onClose={() => setCreating(null)}>
          <WorkspaceWizard
            mode="org"
            onComplete={({ orgId: newOrgId, projectId: newProjectId }) => {
              setCreating(null)
              void navigate({
                to: '/dashboard/$orgId/$projectId',
                params: { orgId: newOrgId, projectId: newProjectId },
              })
            }}
          />
        </Modal>
      )}

      {creating === 'project' && currentOrg && (
        <Modal
          title="Create project"
          subtitle="Projects group the environments your secrets live in."
          onClose={() => setCreating(null)}
        >
          <CreateProjectForm
            org={currentOrg}
            onCreated={(project) => {
              setCreating(null)
              void navigate({
                to: '/dashboard/$orgId/$projectId',
                params: { orgId: currentOrg.id, projectId: project.id },
              })
            }}
          />
        </Modal>
      )}
    </>
  )
}
