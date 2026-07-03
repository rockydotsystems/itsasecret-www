import { createFileRoute } from '@tanstack/react-router'
import { requireAuthBeforeLoad } from '~/lib/route-guards'

export const Route = createFileRoute('/dashboard/$orgId/settings')({
  beforeLoad: requireAuthBeforeLoad,
  component: OrgSettingsPage,
})

function OrgSettingsPage() {
  return null
}
