import { useNavigate } from '@tanstack/react-router'
import { Button } from '~/components/button'
import { SecretRow } from '~/components/secretrow'
import { EnvironmentTag } from '~/components/environmenttag'
import { DashboardTopBar } from '~/components/dashboardtopbar'
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
}

export function DashboardShell({ orgs, orgId, projects, projectId, environments, envId }: DashboardShellProps) {
  const navigate = useNavigate()

  const projectName = projects.find((p) => p.id === projectId)?.name || 'Select project'

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
