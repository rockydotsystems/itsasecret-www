import { createFileRoute } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'
import { DashboardTopBar } from '~/components/dashboardtopbar'
import { ProfileSettings } from '~/components/profilesettings'
import { resolveLastVisitedFn, getOrgViewFn } from '~/lib/orgs-server'
import type { OrgView } from '~/lib/orgs-server'

export const Route = createFileRoute('/dashboard/profile')({
  beforeLoad: requireAuthBeforeLoad,
  // The profile is account-level; the org/project data only feeds the top bar.
  loader: async (): Promise<OrgView & { orgId: string }> => {
    const last = await resolveLastVisitedFn()
    if (!last.orgId) return { orgs: [], projects: [], projectId: '', orgId: '' }
    const view = await getOrgViewFn({ data: { orgId: last.orgId } })
    return { ...view, orgId: last.orgId }
  },
  component: ProfilePage,
})

function ProfilePage() {
  const view = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  return (
    <div className="app-shell">
      <DashboardTopBar orgs={view.orgs} orgId={view.orgId} projects={view.projects} projectId={view.projectId} />
      <main className="app-main">
        <div className="app-meta">
          <h1 className="app-title">Your profile</h1>
          <span className="app-subtitle">{user.email}</span>
        </div>
        <div className="settings-sections">
          <ProfileSettings email={user.email} name={user.name} />
        </div>
      </main>
    </div>
  )
}
