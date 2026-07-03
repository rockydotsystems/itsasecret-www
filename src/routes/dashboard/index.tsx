import { createFileRoute, redirect } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { DashboardShell } from '~/components/dashboardshell'
import { resolveLastVisitedFn } from '~/lib/orgs-server'

export const Route = createFileRoute('/dashboard/')({
  beforeLoad: requireAuthBeforeLoad,
  loader: async () => {
    const last = await resolveLastVisitedFn()
    if (last.projectId) {
      throw redirect({
        to: '/dashboard/$orgId/$projectId',
        params: { orgId: last.orgId, projectId: last.projectId },
        search: last.envId ? { env: last.envId } : undefined,
        replace: true,
      })
    }
    if (last.orgId) {
      throw redirect({ to: '/dashboard/$orgId', params: { orgId: last.orgId }, replace: true })
    }
    // No orgs at all: render the empty shell.
  },
  component: EmptyDashboardPage,
})

function EmptyDashboardPage() {
  return <DashboardShell orgs={[]} orgId="" projects={[]} projectId="" environments={[]} envId="" />
}
