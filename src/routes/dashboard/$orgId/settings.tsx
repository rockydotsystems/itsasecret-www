import { createFileRoute, redirect } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { DashboardTopBar } from '~/components/dashboardtopbar'
import { getOrgViewFn } from '~/lib/orgs-server'
import type { OrgView } from '~/lib/orgs-server'

export const Route = createFileRoute('/dashboard/$orgId/settings')({
  beforeLoad: requireAuthBeforeLoad,
  loader: async ({ params }): Promise<OrgView> => {
    try {
      return await getOrgViewFn({ data: { orgId: params.orgId } })
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
      <DashboardTopBar orgs={view.orgs} orgId={orgId} projects={view.projects} projectId="" />
      <main className="app-main" />
    </div>
  )
}
