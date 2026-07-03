import { createFileRoute } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'

export const Route = createFileRoute('/projects/$projectId/settings')({
  beforeLoad: requireAuthBeforeLoad,
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  return null
}
