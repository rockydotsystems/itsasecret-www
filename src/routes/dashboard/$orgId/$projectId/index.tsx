import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { DashboardShell } from '~/components/dashboardshell'
import { getProjectViewFn } from '~/lib/orgs-server'
import type { ProjectView } from '~/lib/orgs-server'

const projectSearchSchema = z.object({
  env: z.string().optional(),
})

export const Route = createFileRoute('/dashboard/$orgId/$projectId/')({
  validateSearch: projectSearchSchema,
  beforeLoad: requireAuthBeforeLoad,
  loaderDeps: ({ search }) => ({ env: search.env }),
  loader: async ({ params, deps }): Promise<ProjectView> => {
    let view: ProjectView
    try {
      view = await getProjectViewFn({
        data: { orgId: params.orgId, projectId: params.projectId, envId: deps.env },
      })
    } catch {
      // Unknown project or no access: fall back to the org level.
      throw redirect({ to: '/dashboard/$orgId', params: { orgId: params.orgId }, replace: true })
    }
    // Canonicalize the URL so the resolved environment is always in it.
    if (view.envId && view.envId !== deps.env) {
      throw redirect({
        to: '/dashboard/$orgId/$projectId',
        params,
        search: { env: view.envId },
        replace: true,
      })
    }
    return view
  },
  component: ProjectDashboardPage,
})

function ProjectDashboardPage() {
  const { orgId, projectId } = Route.useParams()
  const view = Route.useLoaderData()
  return (
    <DashboardShell
      orgs={view.orgs}
      orgId={orgId}
      projects={view.projects}
      projectId={projectId}
      environments={view.environments}
      envId={view.envId}
    />
  )
}
