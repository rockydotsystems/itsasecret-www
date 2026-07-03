import { createFileRoute } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'

export const Route = createFileRoute('/dashboard/$orgId/$projectId/settings')({
  beforeLoad: requireAuthBeforeLoad,
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  return null
}
