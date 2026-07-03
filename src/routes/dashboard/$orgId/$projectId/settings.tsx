import { createFileRoute, redirect } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { DashboardTopBar } from '~/components/dashboardtopbar'
import { ProjectSettings } from '~/components/projectsettings'
import { getProjectSettingsFn } from '~/lib/orgs-server'
import type { ProjectSettingsView } from '~/lib/orgs-server'

export const Route = createFileRoute('/dashboard/$orgId/$projectId/settings')({
  beforeLoad: requireAuthBeforeLoad,
  loader: async ({ params }): Promise<ProjectSettingsView> => {
    try {
      return await getProjectSettingsFn({ data: { orgId: params.orgId, projectId: params.projectId } })
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
      <main className="app-main">
        <div className="app-meta">
          <h1 className="app-title">Project settings</h1>
          <span className="app-subtitle">
            {view.project.name} · {view.environments.length}{' '}
            {view.environments.length === 1 ? 'environment' : 'environments'}
          </span>
        </div>
        <ProjectSettings view={view} key={view.project.id} />
      </main>
    </div>
  )
}
