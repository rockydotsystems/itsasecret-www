import { createFileRoute, redirect } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { DashboardShell } from '~/components/dashboardshell'
import { getOrgViewFn } from '~/lib/orgs-server'
import type { OrgView } from '~/lib/orgs-server'

export const Route = createFileRoute('/dashboard/$orgId/')({
  beforeLoad: requireAuthBeforeLoad,
  loader: async ({ params }): Promise<OrgView> => {
    let view: OrgView
    try {
      view = await getOrgViewFn({ data: { orgId: params.orgId } })
    } catch {
      // Unknown or inaccessible org: fall back to last-visited resolution.
      throw redirect({ to: '/dashboard', replace: true })
    }
    if (view.projectId) {
      throw redirect({
        to: '/dashboard/$orgId/$projectId',
        params: { orgId: params.orgId, projectId: view.projectId },
        replace: true,
      })
    }
    return view
  },
  component: OrgDashboardPage,
})

function OrgDashboardPage() {
  const { orgId } = Route.useParams()
  const view = Route.useLoaderData()
  return (
    <DashboardShell
      orgs={view.orgs}
      orgId={orgId}
      projects={view.projects}
      projectId=""
      environments={[]}
      envId=""
    />
  )
}
