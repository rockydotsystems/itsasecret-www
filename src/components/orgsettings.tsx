import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Avatar } from '~/components/avatar'
import { Badge } from '~/components/badge'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LoadingDots } from '~/components/loadingdots'
import { Modal } from '~/components/modal'
import { Select } from '~/components/select'
import {
  renameOrg,
  transferOrgOwnership,
  deleteOrg,
  inviteMember,
  changeMemberRole,
  removeMember,
} from '~/lib/org-settings-form'
import {
  createTeam,
  renameTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
} from '~/lib/teams-form'
import type { MemberRole } from '~/lib/org-settings-form'
import type { OrgMemberView, OrgSettingsView, TeamView } from '~/lib/orgs-server'

export type OrgSettingsProps = {
  view: OrgSettingsView
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
]

function formatJoined(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function OrgSettings({ view }: OrgSettingsProps) {
  const { org, members, teams, currentUserId, currentUserRole } = view
  const navigate = useNavigate()
  const router = useRouter()

  const isPersonal = org.kind === 'personal'
  const isOwner = org.owner_user_id === currentUserId
  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin'

  async function refresh() {
    await router.invalidate()
  }

  return (
    <div className="settings-sections">
      <GeneralSection org={org} canManage={canManage} isPersonal={isPersonal} onSaved={refresh} />
      <MembersSection
        orgId={org.id}
        members={members}
        ownerUserId={org.owner_user_id}
        currentUserId={currentUserId}
        canManage={canManage}
        isPersonal={isPersonal}
        onChanged={refresh}
      />
      <TeamsSection
        orgId={org.id}
        teams={teams}
        members={members}
        canManage={canManage}
        isPersonal={isPersonal}
        onChanged={refresh}
      />
      <DangerSection
        org={org}
        members={members}
        isOwner={isOwner}
        isPersonal={isPersonal}
        onTransferred={refresh}
        onDeleted={() => void navigate({ to: '/dashboard' })}
      />
    </div>
  )
}

function GeneralSection({
  org,
  canManage,
  isPersonal,
  onSaved,
}: {
  org: OrgSettingsView['org']
  canManage: boolean
  isPersonal: boolean
  onSaved: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    const name = (e.currentTarget.elements.namedItem('name') as HTMLInputElement).value.trim()
    try {
      if (!name) throw new Error('Name cannot be empty')
      await renameOrg(org.id, name)
      await onSaved()
      setSaved(true)
    } catch (err) {
      setError((err as Error).message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">General</h2>
          <p className="settings-section-desc">
            {isPersonal
              ? 'This is your personal organization.'
              : 'Basic details for this organization.'}
          </p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="settings-form">
        <Input
          name="name"
          label="Organization name"
          value={org.name}
          disabled={!canManage}
          required
        />
        <div className="settings-static">
          <span className="input-label">Organization ID</span>
          <div className="settings-static-value">
            <code>{org.id}</code>
            <Badge variant={isPersonal ? 'neutral' : 'signal'}>{isPersonal ? 'personal' : 'shared'}</Badge>
          </div>
          <span className="input-helper">The unique identifier for this organization.</span>
        </div>
        {error && <span className="input-error">{error}</span>}
        {canManage && (
          <div className="settings-form-actions">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <LoadingDots /> : 'Save changes'}
            </Button>
            {saved && <span className="settings-saved-note">Saved</span>}
          </div>
        )}
      </form>
    </section>
  )
}

function MembersSection({
  orgId,
  members,
  ownerUserId,
  currentUserId,
  canManage,
  isPersonal,
  onChanged,
}: {
  orgId: string
  members: OrgMemberView[]
  ownerUserId: string
  currentUserId: string
  canManage: boolean
  isPersonal: boolean
  onChanged: () => Promise<void>
}) {
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<OrgMemberView | null>(null)
  const [busyUserId, setBusyUserId] = useState('')
  const [error, setError] = useState('')

  async function handleRoleChange(member: OrgMemberView, role: string) {
    if (role === member.role) return
    setBusyUserId(member.user_id)
    setError('')
    try {
      await changeMemberRole(orgId, member.user_id, role as MemberRole)
      await onChanged()
    } catch (err) {
      setError((err as Error).message || 'Failed to change role')
    } finally {
      setBusyUserId('')
    }
  }

  return (
    <section className="card settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Members</h2>
          <p className="settings-section-desc">
            {isPersonal
              ? 'Personal organizations are single-member. Create a shared organization to collaborate with others.'
              : 'People with access to every project in this organization. Owners and admins can manage all environments.'}
          </p>
        </div>
        {!isPersonal && canManage && (
          <Button size="sm" variant="secondary" onClick={() => setInviting(true)}>
            Invite member
          </Button>
        )}
      </div>

      {!isPersonal && (
        <div className="member-list">
          {members.map((member) => {
            const memberIsOwner = member.user_id === ownerUserId
            const isSelf = member.user_id === currentUserId
            return (
              <div key={member.user_id} className="member-row">
                <Avatar name={member.email} size="md" />
                <div className="member-row-info">
                  <span className="member-row-email">
                    {member.email}
                    {isSelf && <Badge variant="info">you</Badge>}
                  </span>
                  <span className="member-row-meta">Joined {formatJoined(member.created_at)}</span>
                </div>
                <div className="member-row-actions">
                  {memberIsOwner ? (
                    <Badge variant="signal" dot>owner</Badge>
                  ) : canManage ? (
                    <>
                      <Select
                        value={member.role}
                        options={ROLE_OPTIONS}
                        onChange={(role) => void handleRoleChange(member, role)}
                        disabled={busyUserId === member.user_id}
                        className="member-role-select"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyUserId === member.user_id}
                        onClick={() => setRemoving(member)}
                      >
                        {isSelf ? 'Leave' : 'Remove'}
                      </Button>
                    </>
                  ) : (
                    <Badge variant="neutral">{member.role}</Badge>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {error && <span className="input-error">{error}</span>}

      {inviting && (
        <InviteMemberModal
          orgId={orgId}
          onClose={() => setInviting(false)}
          onInvited={async () => {
            setInviting(false)
            await onChanged()
          }}
        />
      )}

      {removing && (
        <RemoveMemberModal
          orgId={orgId}
          member={removing}
          isSelf={removing.user_id === currentUserId}
          onClose={() => setRemoving(null)}
          onRemoved={async () => {
            setRemoving(null)
            await onChanged()
          }}
        />
      )}
    </section>
  )
}

function InviteMemberModal({
  orgId,
  onClose,
  onInvited,
}: {
  orgId: string
  onClose: () => void
  onInvited: () => Promise<void>
}) {
  const [role, setRole] = useState('member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const email = (e.currentTarget.elements.namedItem('email') as HTMLInputElement).value.trim()
    try {
      await inviteMember(orgId, email, role as MemberRole)
      await onInvited()
    } catch (err) {
      setError((err as Error).message || 'Failed to invite member')
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Invite member"
      subtitle="They need an itsasecret account already. They get access to this organization's key on their next login."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Input
          name="email"
          type="email"
          label="Email"
          placeholder="teammate@example.com"
          required
        />
        <Select
          label="Role"
          value={role}
          options={ROLE_OPTIONS}
          onChange={setRole}
        />
        {error && <span className="input-error">{error}</span>}
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? <LoadingDots /> : 'Send invite'}
        </Button>
      </form>
    </Modal>
  )
}

function RemoveMemberModal({
  orgId,
  member,
  isSelf,
  onClose,
  onRemoved,
}: {
  orgId: string
  member: OrgMemberView
  isSelf: boolean
  onClose: () => void
  onRemoved: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRemove() {
    setLoading(true)
    setError('')
    try {
      await removeMember(orgId, member.user_id)
      if (isSelf) {
        window.location.href = '/login'
        return
      }
      await onRemoved()
    } catch (err) {
      setError((err as Error).message || 'Failed to remove member')
      setLoading(false)
    }
  }

  return (
    <Modal
      title={isSelf ? 'Leave organization' : 'Remove member'}
      subtitle={
        isSelf
          ? 'You will lose access to every project in this organization and be signed out.'
          : `${member.email} will lose access to every project in this organization, and their sessions will be revoked.`
      }
      onClose={onClose}
    >
      {error && <span className="input-error">{error}</span>}
      <div className="settings-modal-actions">
        <Button variant="secondary" size="md" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="danger" size="md" onClick={() => void handleRemove()} disabled={loading}>
          {loading ? <LoadingDots /> : isSelf ? 'Leave organization' : 'Remove member'}
        </Button>
      </div>
    </Modal>
  )
}

// Teams group org members so access can be granted once instead of per
// person. Grants live on environments and projects; membership is managed
// here. Org owner/admin only for changes; visible to every member.
function TeamsSection({
  orgId,
  teams,
  members,
  canManage,
  isPersonal,
  onChanged,
}: {
  orgId: string
  teams: TeamView[]
  members: OrgMemberView[]
  canManage: boolean
  isPersonal: boolean
  onChanged: () => Promise<void>
}) {
  const [creating, setCreating] = useState(false)
  const [managingTeamId, setManagingTeamId] = useState('')
  const [deletingTeamId, setDeletingTeamId] = useState('')

  const managingTeam = teams.find((t) => t.id === managingTeamId)
  const deletingTeam = teams.find((t) => t.id === deletingTeamId)

  return (
    <section className="card settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Teams</h2>
          <p className="settings-section-desc">
            {isPersonal
              ? 'Personal organizations are single-member, so there is nothing to group into teams.'
              : 'Group members to grant access once per team instead of per person. Grant a team access from a project\'s settings or an environment\'s Access dialog. Team access is additive - the widest grant wins.'}
          </p>
        </div>
        {!isPersonal && canManage && (
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            New team
          </Button>
        )}
      </div>

      {!isPersonal && (
        <div className="member-list">
          {teams.map((team) => (
            <div key={team.id} className="member-row">
              <Avatar name={team.name} size="md" />
              <div className="member-row-info">
                <span className="member-row-email">{team.name}</span>
                <span className="member-row-meta">
                  {team.members.length === 0
                    ? 'No members yet'
                    : team.members.map((m) => m.email).join(', ')}
                </span>
              </div>
              <div className="member-row-actions">
                {canManage ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setManagingTeamId(team.id)}>
                      Members
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeletingTeamId(team.id)}>
                      Delete
                    </Button>
                  </>
                ) : (
                  <Badge variant="neutral">
                    {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
                  </Badge>
                )}
              </div>
            </div>
          ))}
          {teams.length === 0 && (
            <p className="settings-section-desc">No teams yet.</p>
          )}
        </div>
      )}

      {creating && (
        <CreateTeamModal
          orgId={orgId}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false)
            await onChanged()
          }}
        />
      )}

      {managingTeam && (
        <TeamMembersModal
          orgId={orgId}
          team={managingTeam}
          members={members}
          onClose={() => setManagingTeamId('')}
          onChanged={onChanged}
        />
      )}

      {deletingTeam && (
        <DeleteTeamModal
          orgId={orgId}
          team={deletingTeam}
          onClose={() => setDeletingTeamId('')}
          onDeleted={async () => {
            setDeletingTeamId('')
            await onChanged()
          }}
        />
      )}
    </section>
  )
}

function CreateTeamModal({
  orgId,
  onClose,
  onCreated,
}: {
  orgId: string
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const name = (e.currentTarget.elements.namedItem('name') as HTMLInputElement).value.trim()
    try {
      if (!name) throw new Error('Name cannot be empty')
      await createTeam(orgId, name)
      await onCreated()
    } catch (err) {
      setError((err as Error).message || 'Failed to create team')
      setLoading(false)
    }
  }

  return (
    <Modal
      title="New team"
      subtitle="Teams have no access until you grant it - from a project's settings for project-wide access, or an environment's Access dialog."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Input
          name="name"
          label="Team name"
          placeholder="e.g. backend"
          required
        />
        {error && <span className="input-error">{error}</span>}
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? <LoadingDots /> : 'Create team'}
        </Button>
      </form>
    </Modal>
  )
}

function TeamMembersModal({
  orgId,
  team,
  members,
  onClose,
  onChanged,
}: {
  orgId: string
  team: TeamView
  members: OrgMemberView[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [addUserId, setAddUserId] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const addable = members.filter(
    (m) => !team.members.some((tm) => tm.user_id === m.user_id)
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

  async function handleRename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = (e.currentTarget.elements.namedItem('teamname') as HTMLInputElement).value.trim()
    if (!name || name === team.name) {
      setRenaming(false)
      return
    }
    await run(() => renameTeam(orgId, team.id, name))
    setRenaming(false)
  }

  return (
    <Modal
      title={team.name}
      subtitle="Everyone in the team inherits its grants. Owners and admins don't need them - they already have full access."
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {renaming ? (
          <form onSubmit={(e) => void handleRename(e)} className="settings-grant-form">
            <Input name="teamname" value={team.name} required />
            <Button size="sm" type="submit" disabled={busy}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRenaming(false)} disabled={busy}>
              Cancel
            </Button>
          </form>
        ) : (
          <div>
            <Button size="sm" variant="ghost" onClick={() => setRenaming(true)} disabled={busy}>
              Rename team
            </Button>
          </div>
        )}

        <div className="member-list">
          {team.members.map((member) => (
            <div key={member.user_id} className="member-row">
              <Avatar name={member.email} size="sm" />
              <div className="member-row-info">
                <span className="member-row-email">{member.email}</span>
              </div>
              <div className="member-row-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void run(() => removeTeamMember(orgId, team.id, member.user_id))}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {team.members.length === 0 && (
            <p className="settings-section-desc">No members yet.</p>
          )}
        </div>

        {addable.length > 0 ? (
          <div className="settings-grant-form">
            <Select
              value={addUserId}
              options={addable.map((m) => ({ value: m.user_id, label: m.email }))}
              onChange={setAddUserId}
              placeholder="Select a member..."
              className="settings-grant-member"
            />
            <Button
              size="sm"
              disabled={busy || !addUserId}
              onClick={() =>
                void run(async () => {
                  await addTeamMember(orgId, team.id, addUserId)
                  setAddUserId('')
                })
              }
            >
              Add
            </Button>
          </div>
        ) : (
          <p className="input-helper">Every org member is already in this team.</p>
        )}
        {error && <span className="input-error">{error}</span>}
      </div>
    </Modal>
  )
}

function DeleteTeamModal({
  orgId,
  team,
  onClose,
  onDeleted,
}: {
  orgId: string
  team: TeamView
  onClose: () => void
  onDeleted: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setLoading(true)
    setError('')
    try {
      await deleteTeam(orgId, team.id)
      await onDeleted()
    } catch (err) {
      setError((err as Error).message || 'Failed to delete team')
      setLoading(false)
    }
  }

  return (
    <Modal
      title={`Delete ${team.name}`}
      subtitle="Every grant this team holds stops working immediately. Members keep any access they were granted individually."
      onClose={onClose}
    >
      {error && <span className="input-error">{error}</span>}
      <div className="settings-modal-actions">
        <Button variant="secondary" size="md" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="danger" size="md" onClick={() => void handleDelete()} disabled={loading}>
          {loading ? <LoadingDots /> : 'Delete team'}
        </Button>
      </div>
    </Modal>
  )
}

function DangerSection({
  org,
  members,
  isOwner,
  isPersonal,
  onTransferred,
  onDeleted,
}: {
  org: OrgSettingsView['org']
  members: OrgMemberView[]
  isOwner: boolean
  isPersonal: boolean
  onTransferred: () => Promise<void>
  onDeleted: () => void
}) {
  const [transferring, setTransferring] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (isPersonal) {
    return (
      <section className="card settings-section">
        <div className="settings-section-header">
          <div>
            <h2 className="settings-section-title">Danger zone</h2>
            <p className="settings-section-desc">
              Personal organizations cannot be transferred or deleted - they live and die with your account.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (!isOwner) return null

  const otherMembers = members.filter((m) => m.user_id !== org.owner_user_id)

  return (
    <section className="card settings-section settings-section-danger">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Danger zone</h2>
          <p className="settings-section-desc">Owner-only actions. These affect everyone in the organization.</p>
        </div>
      </div>

      <div className="danger-row">
        <div className="danger-row-info">
          <span className="danger-row-title">Transfer ownership</span>
          <span className="danger-row-desc">
            Make another member the owner. You become an admin.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={otherMembers.length === 0}
          onClick={() => setTransferring(true)}
        >
          Transfer
        </Button>
      </div>

      <div className="danger-row">
        <div className="danger-row-info">
          <span className="danger-row-title">Delete organization</span>
          <span className="danger-row-desc">
            Deletes every project, environment, and secret under it. Recoverable for 90 days, then purged.
          </span>
        </div>
        <Button size="sm" variant="danger" onClick={() => setDeleting(true)}>
          Delete
        </Button>
      </div>

      {transferring && (
        <TransferOwnershipModal
          orgId={org.id}
          members={otherMembers}
          onClose={() => setTransferring(false)}
          onTransferred={async () => {
            setTransferring(false)
            await onTransferred()
          }}
        />
      )}

      {deleting && (
        <DeleteOrgModal
          org={org}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      )}
    </section>
  )
}

function TransferOwnershipModal({
  orgId,
  members,
  onClose,
  onTransferred,
}: {
  orgId: string
  members: OrgMemberView[]
  onClose: () => void
  onTransferred: () => Promise<void>
}) {
  const [newOwnerId, setNewOwnerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleTransfer() {
    if (!newOwnerId) return
    setLoading(true)
    setError('')
    try {
      await transferOrgOwnership(orgId, newOwnerId)
      await onTransferred()
    } catch (err) {
      setError((err as Error).message || 'Failed to transfer ownership')
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Transfer ownership"
      subtitle="The new owner gets full control, including the ability to delete the organization. You become an admin."
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Select
          label="New owner"
          value={newOwnerId}
          options={members.map((m) => ({ value: m.user_id, label: m.email }))}
          onChange={setNewOwnerId}
          placeholder="Select a member..."
        />
        {error && <span className="input-error">{error}</span>}
        <div className="settings-modal-actions">
          <Button variant="secondary" size="md" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" size="md" onClick={() => void handleTransfer()} disabled={loading || !newOwnerId}>
            {loading ? <LoadingDots /> : 'Transfer ownership'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function DeleteOrgModal({
  org,
  onClose,
  onDeleted,
}: {
  org: OrgSettingsView['org']
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setLoading(true)
    setError('')
    try {
      await deleteOrg(org.id)
      onDeleted()
    } catch (err) {
      setError((err as Error).message || 'Failed to delete organization')
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Delete organization"
      subtitle={`This deletes everything under ${org.name} for every member. Data is kept for 90 days, then permanently purged.`}
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="input-group">
          <label className="input-label" htmlFor="confirm-org-name">
            Type <strong>{org.name}</strong> to confirm
          </label>
          <input
            id="confirm-org-name"
            type="text"
            className="input-field"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={org.name}
            autoComplete="off"
          />
        </div>
        {error && <span className="input-error">{error}</span>}
        <div className="settings-modal-actions">
          <Button variant="secondary" size="md" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={() => void handleDelete()}
            disabled={loading || confirmation !== org.name}
          >
            {loading ? <LoadingDots /> : 'Delete organization'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
