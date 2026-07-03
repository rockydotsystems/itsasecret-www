import { createFileRoute, redirect } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { DashboardTopBar } from '~/components/dashboardtopbar'
import { getProjectViewFn } from '~/lib/orgs-server'
import type { ProjectView } from '~/lib/orgs-server'

export const Route = createFileRoute('/dashboard/$orgId/$projectId/settings')({
  beforeLoad: requireAuthBeforeLoad,
  loader: async ({ params }): Promise<ProjectView> => {
    try {
      return await getProjectViewFn({ data: { orgId: params.orgId, projectId: params.projectId } })
    } catch {
      throw redirect({ to: '/dashboard/$orgId', params: { orgId: params.orgId }, replace: true })
    }
  },
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { orgId, projectId } = Route.useParams()
  const view = Route.useLoaderData()
  return (
    <div className="app-shell">
      <DashboardTopBar orgs={view.orgs} orgId={orgId} projects={view.projects} projectId={projectId} />
      <main className="app-main" />
    </div>
  )
}
