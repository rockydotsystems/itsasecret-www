import { createFileRoute, redirect } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { DashboardTopBar } from '~/components/dashboardtopbar'
import { OrgSettings } from '~/components/orgsettings'
import { getOrgSettingsFn } from '~/lib/orgs-server'
import type { OrgSettingsView } from '~/lib/orgs-server'

export const Route = createFileRoute('/dashboard/$orgId/settings')({
  beforeLoad: requireAuthBeforeLoad,
  loader: async ({ params }): Promise<OrgSettingsView> => {
    try {
      return await getOrgSettingsFn({ data: { orgId: params.orgId } })
    } catch {
      throw redirect({ to: '/dashboard', replace: true })
    }
  },
  component: OrgSettingsPage,
})

function OrgSettingsPage() {
  const { orgId } = Route.useParams()
  const view = Route.useLoaderData()
  return (
    <div className="app-shell">
      <DashboardTopBar orgs={view.orgs} orgId={orgId} projects={view.projects} projectId={view.projectId} />
      <main className="app-main">
        <div className="app-meta">
          <h1 className="app-title">Organization settings</h1>
          <span className="app-subtitle">
            {view.org.name} · {view.members.length} {view.members.length === 1 ? 'member' : 'members'}
          </span>
        </div>
        <OrgSettings view={view} key={view.org.id} />
      </main>
    </div>
  )
}
