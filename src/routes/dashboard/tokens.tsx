import { createFileRoute } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { DashboardTopBar } from '~/components/dashboardtopbar'
import { AccessTokens } from '~/components/accesstokens'
import { resolveLastVisitedFn, getOrgViewFn } from '~/lib/orgs-server'
import type { OrgView } from '~/lib/orgs-server'

export const Route = createFileRoute('/dashboard/tokens')({
  beforeLoad: requireAuthBeforeLoad,
  // Tokens are account-level; the org/project data only feeds the top bar.
  loader: async (): Promise<OrgView & { orgId: string }> => {
    const last = await resolveLastVisitedFn()
    if (!last.orgId) return { orgs: [], projects: [], projectId: '', orgId: '' }
    const view = await getOrgViewFn({ data: { orgId: last.orgId } })
    return { ...view, orgId: last.orgId }
  },
  component: TokensPage,
})

function TokensPage() {
  const view = Route.useLoaderData()
  return (
    <div className="app-shell">
      <DashboardTopBar orgs={view.orgs} orgId={view.orgId} projects={view.projects} projectId={view.projectId} />
      <main className="app-main">
        <div className="app-meta">
          <h1 className="app-title">Access tokens</h1>
          <span className="app-subtitle">Long-lived credentials for headless machines</span>
        </div>
        <div className="settings-sections">
          <AccessTokens />
        </div>
      </main>
    </div>
  )
}
