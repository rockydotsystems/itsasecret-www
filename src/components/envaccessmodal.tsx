import { useState } from 'react'
import { Avatar } from '~/components/avatar'
import { Button } from '~/components/button'
import { Modal } from '~/components/modal'
import { Select } from '~/components/select'
import {
  grantEnvPermission,
  changeEnvPermission,
  revokeEnvPermission,
} from '~/lib/project-settings-form'
import type { EnvRole } from '~/lib/project-settings-form'
import type { EnvPermissionView, OrgMemberView } from '~/lib/orgs-server'
import type { Environment } from '~/lib/schema'

export const ENV_ROLE_OPTIONS = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'admin', label: 'Admin' },
]

// Per-environment access management: list/change/revoke existing grants and
// add new ones. Shared between project settings and the dashboard.
export function EnvAccessModal({
  env,
  grants,
  members,
  onClose,
  onChanged,
}: {
  env: Environment
  grants: EnvPermissionView[]
  members: OrgMemberView[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [grantUserId, setGrantUserId] = useState('')
  const [grantRole, setGrantRole] = useState('read')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Owners/admins bypass RBAC entirely; only plain members need grants.
  const grantable = members.filter(
    (m) => m.role === 'member' && !grants.some((g) => g.user_id === m.user_id)
  )

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
      await onChanged()
    } catch (err) {
      setError((err as Error).message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Access to ${env.name}`}
      subtitle="Environment-level permissions for org members. Owners and admins always have full access and don't need grants."
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="member-list">
          {grants.map((grant) => (
            <div key={grant.user_id} className="member-row">
              <Avatar name={grant.email} size="sm" />
              <div className="member-row-info">
                <span className="member-row-email">{grant.email}</span>
              </div>
              <div className="member-row-actions">
                <Select
                  value={grant.role}
                  options={ENV_ROLE_OPTIONS}
                  onChange={(role) => void run(() => changeEnvPermission(env.id, grant.user_id, role as EnvRole))}
                  disabled={busy}
                  className="member-role-select"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void run(() => revokeEnvPermission(env.id, grant.user_id))}
                >
                  Revoke
                </Button>
              </div>
            </div>
          ))}
          {grants.length === 0 && (
            <p className="settings-section-desc">No direct grants on this environment yet.</p>
          )}
        </div>

        {grantable.length > 0 ? (
          <div className="settings-grant-form">
            <Select
              value={grantUserId}
              options={grantable.map((m) => ({ value: m.user_id, label: m.email }))}
              onChange={setGrantUserId}
              placeholder="Select a member..."
              className="settings-grant-member"
            />
            <Select
              value={grantRole}
              options={ENV_ROLE_OPTIONS}
              onChange={setGrantRole}
              className="member-role-select"
            />
            <Button
              size="sm"
              disabled={busy || !grantUserId}
              onClick={() =>
                void run(async () => {
                  await grantEnvPermission(env.id, grantUserId, grantRole as EnvRole)
                  setGrantUserId('')
                })
              }
            >
              Grant
            </Button>
          </div>
        ) : (
          <p className="input-helper">Every org member already has a grant, or there are no plain members to grant.</p>
        )}
        {error && <span className="input-error">{error}</span>}
      </div>
    </Modal>
  )
}
