import { createFileRoute } from '@tanstack/react-router'
import { Button } from '~/components/button'
import { Avatar } from '~/components/avatar'
import { LogoMark } from '~/components/logo'
import { SecretRow } from '~/components/secretrow'
import { EnvironmentTag } from '~/components/environmenttag'

const SECRETS = [
  { name: 'STRIPE_SECRET_KEY', value: 'sk_live_••••••••••••••••', lastSynced: '2m ago' },
  { name: 'DATABASE_URL', value: 'postgres://••••••••••••', lastSynced: '1h ago' },
  { name: 'JWT_SIGNING_KEY', value: '-----BEGIN ••••••••', lastSynced: '3h ago' },
  { name: 'ANTHROPIC_API_KEY', value: 'sk-ant-••••••••••••', lastSynced: 'yesterday' },
]

const ENVIRONMENTS = ['production', 'staging', 'preview-pr-42']

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <LogoMark size={24} />
          <span style={{ font: '600 var(--text-md)/var(--leading-snug) var(--font-family-display)', color: 'var(--text-primary)' }}>
            itsasecret
          </span>
        </div>

        <nav className="sidebar-nav">
          <a href="/dashboard" className="sidebar-link active">Secrets</a>
          <a href="/dashboard/projects" className="sidebar-link">Projects</a>
          <a href="/dashboard/environments" className="sidebar-link">Environments</a>
          <a href="/dashboard/activity" className="sidebar-link">Activity</a>
          <div className="sidebar-section-label">Org</div>
          <a href="/dashboard/members" className="sidebar-link">Members</a>
          <a href="/dashboard/settings" className="sidebar-link">Settings</a>
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px' }}>
            <Avatar name="Hack R" size="sm" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>hackr</span>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>personal org</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-header">
          <div>
            <h1 style={{ font: '600 var(--text-3xl)/var(--leading-snug) var(--font-family-display)', color: 'var(--text-primary)', marginBottom: '4px' }}>
              acme-api
            </h1>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              12 secrets · synced to 3 machines · 3 environments
            </span>
          </div>
          <Button variant="primary" size="md">Add secret</Button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {ENVIRONMENTS.map((env, i) => (
            <EnvironmentTag key={env} name={env} active={i === 0} href={`/dashboard?env=${env}`} />
          ))}
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
