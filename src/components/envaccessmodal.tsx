import { useState } from 'react'
import { Avatar } from '~/components/avatar'
import { Badge } from '~/components/badge'
import { Button } from '~/components/button'
import { Modal } from '~/components/modal'
import { Select } from '~/components/select'
import {
  grantEnvPermission,
  changeEnvPermission,
  revokeEnvPermission,
} from '~/lib/project-settings-form'
import {
  grantTeamEnvPermission,
  changeTeamEnvPermission,
  revokeTeamEnvPermission,
} from '~/lib/teams-form'
import type { EnvRole } from '~/lib/project-settings-form'
import type {
  EnvPermissionView,
  OrgMemberView,
  TeamView,
  TeamEnvPermissionView,
  TeamProjectPermissionView,
} from '~/lib/orgs-server'
import type { Environment } from '~/lib/schema'

export const ENV_ROLE_OPTIONS = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'admin', label: 'Admin' },
]

// Per-environment access management: list/change/revoke existing grants and
// add new ones, for individual members and for teams. Shared between project
// settings and the dashboard. Project-level team grants show up as
// display-only rows - they cover this env but are managed in project
// settings, so revoking here would do nothing.
export function EnvAccessModal({
  env,
  grants,
  members,
  teams = [],
  teamGrants = [],
  projectTeamGrants = [],
  onClose,
  onChanged,
}: {
  env: Environment
  grants: EnvPermissionView[]
  members: OrgMemberView[]
  teams?: TeamView[]
  teamGrants?: TeamEnvPermissionView[]
  projectTeamGrants?: TeamProjectPermissionView[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [grantUserId, setGrantUserId] = useState('')
  const [grantRole, setGrantRole] = useState('read')
  const [grantTeamId, setGrantTeamId] = useState('')
  const [teamGrantRole, setTeamGrantRole] = useState('read')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Owners/admins bypass RBAC entirely; only plain members need grants.
  const grantable = members.filter(
    (m) => m.role === 'member' && !grants.some((g) => g.user_id === m.user_id)
  )
  const grantableTeams = teams.filter(
    (t) => !teamGrants.some((g) => g.team_id === t.id)
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
      subtitle="Environment-level permissions for org members and teams. Owners and admins always have full access and don't need grants."
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
          {teamGrants.map((grant) => (
            <div key={grant.team_id} className="member-row">
              <Avatar name={grant.team_name} size="sm" />
              <div className="member-row-info">
                <span className="member-row-email">
                  {grant.team_name}
                  <Badge variant="neutral">team</Badge>
                </span>
              </div>
              <div className="member-row-actions">
                <Select
                  value={grant.role}
                  options={ENV_ROLE_OPTIONS}
                  onChange={(role) => void run(() => changeTeamEnvPermission(env.id, grant.team_id, role as EnvRole))}
                  disabled={busy}
                  className="member-role-select"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void run(() => revokeTeamEnvPermission(env.id, grant.team_id))}
                >
                  Revoke
                </Button>
              </div>
            </div>
          ))}
          {projectTeamGrants.map((grant) => (
            <div key={grant.team_id} className="member-row">
              <Avatar name={grant.team_name} size="sm" />
              <div className="member-row-info">
                <span className="member-row-email">
                  {grant.team_name}
                  <Badge variant="neutral">team</Badge>
                  <Badge variant="info">via project</Badge>
                </span>
                <span className="member-row-meta">
                  Covers every environment in the project. Manage in project settings.
                </span>
              </div>
              <div className="member-row-actions">
                <Badge variant="neutral">{grant.role}</Badge>
              </div>
            </div>
          ))}
          {grants.length === 0 && teamGrants.length === 0 && projectTeamGrants.length === 0 && (
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

        {grantableTeams.length > 0 && (
          <div className="settings-grant-form">
            <Select
              value={grantTeamId}
              options={grantableTeams.map((t) => ({ value: t.id, label: t.name }))}
              onChange={setGrantTeamId}
              placeholder="Select a team..."
              className="settings-grant-member"
            />
            <Select
              value={teamGrantRole}
              options={ENV_ROLE_OPTIONS}
              onChange={setTeamGrantRole}
              className="member-role-select"
            />
            <Button
              size="sm"
              disabled={busy || !grantTeamId}
              onClick={() =>
                void run(async () => {
                  await grantTeamEnvPermission(env.id, grantTeamId, teamGrantRole as EnvRole)
                  setGrantTeamId('')
                })
              }
            >
              Grant team
            </Button>
          </div>
        )}
        {error && <span className="input-error">{error}</span>}
      </div>
    </Modal>
  )
}
