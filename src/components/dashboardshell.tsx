import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '~/components/button'
import { SecretRow } from '~/components/secretrow'
import { EnvironmentTag } from '~/components/environmenttag'
import { EnvNameModal } from '~/components/envnamemodal'
import { DashboardTopBar } from '~/components/dashboardtopbar'
import { createEnvironment } from '~/lib/project-settings-form'
import type { Environment, Org, Project } from '~/lib/schema'

const SECRETS = [
  { name: 'STRIPE_SECRET_KEY', value: 'sk_live_••••••••••••••••', lastSynced: '2m ago' },
  { name: 'DATABASE_URL', value: 'postgres://••••••••••••', lastSynced: '1h ago' },
  { name: 'JWT_SIGNING_KEY', value: '-----BEGIN ••••••••', lastSynced: '3h ago' },
  { name: 'ANTHROPIC_API_KEY', value: 'sk-ant-••••••••••••', lastSynced: 'yesterday' },
]

export type DashboardShellProps = {
  orgs: Org[]
  orgId: string
  projects: Project[]
  projectId: string
  environments: Environment[]
  envId: string
  currentUserRole?: string
}

export function DashboardShell({
  orgs,
  orgId,
  projects,
  projectId,
  environments,
  envId,
  currentUserRole = '',
}: DashboardShellProps) {
  const navigate = useNavigate()
  const [creatingEnv, setCreatingEnv] = useState(false)

  const projectName = projects.find((p) => p.id === projectId)?.name || 'Select project'
  // Only org owners and admins can create environments from scratch.
  const canCreateEnv = !!projectId && (currentUserRole === 'owner' || currentUserRole === 'admin')

  function handleEnvChange(nextEnvId: string) {
    if (nextEnvId === envId) return
    void navigate({
      to: '/dashboard/$orgId/$projectId',
      params: { orgId, projectId },
      search: { env: nextEnvId },
    })
  }

  return (
    <div className="app-shell">
      <DashboardTopBar orgs={orgs} orgId={orgId} projects={projects} projectId={projectId} />

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
            {canCreateEnv && (
              <button
                type="button"
                className="env-tag env-tag-add"
                onClick={() => setCreatingEnv(true)}
                aria-label="Create new environment"
              >
                + new
              </button>
            )}
          </div>
          <Button variant="primary" size="md">Add secret</Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {SECRETS.map((s) => (
            <SecretRow key={s.name} name={s.name} value={s.value} lastSynced={s.lastSynced} />
          ))}
        </div>
      </main>

      {creatingEnv && (
        <EnvNameModal
          title="New environment"
          subtitle="Creates an empty environment in this project. To branch an existing one instead, fork it from project settings."
          submitLabel="Create environment"
          placeholder="e.g. staging"
          onClose={() => setCreatingEnv(false)}
          onSubmit={async (name) => {
            const env = await createEnvironment(projectId, name)
            setCreatingEnv(false)
            void navigate({
              to: '/dashboard/$orgId/$projectId',
              params: { orgId, projectId },
              search: { env: env.id },
            })
          }}
        />
      )}
    </div>
  )
}
