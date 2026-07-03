import { Link, useNavigate } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { Button } from '~/components/button'
import { Avatar } from '~/components/avatar'
import { LogoMark } from '~/components/logo'
import { Select } from '~/components/select'
import { Modal } from '~/components/modal'
import { CreateOrgForm } from '~/components/createorgform'
import { CreateProjectForm } from '~/components/createprojectform'
import { performLogout } from '~/lib/auth-form'
import type { Org, Project } from '~/lib/schema'

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export type DashboardTopBarProps = {
  orgs: Org[]
  orgId: string
  projects: Project[]
  projectId: string
}

export function DashboardTopBar({ orgs, orgId, projects, projectId }: DashboardTopBarProps) {
  const navigate = useNavigate()
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
                  <button type="button" onClick={() => setCreating('org')} aria-label="Create new organization">
                    + New org
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
                  <button type="button" onClick={() => setCreating('project')} aria-label="Create new project">
                    + New project
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

      {creating === 'org' && (
        <Modal
          title="Create organization"
          subtitle="Shared orgs let you invite teammates and collaborate on projects."
          onClose={() => setCreating(null)}
        >
          <CreateOrgForm
            onCreated={(org) => {
              setCreating(null)
              void navigate({ to: '/dashboard/$orgId', params: { orgId: org.id } })
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
