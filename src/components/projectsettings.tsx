import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Avatar } from '~/components/avatar'
import { Badge } from '~/components/badge'
import { Button } from '~/components/button'
import { EnvAccessModal, ENV_ROLE_OPTIONS } from '~/components/envaccessmodal'
import { EnvironmentTag } from '~/components/environmenttag'
import { EnvNameModal } from '~/components/envnamemodal'
import {
  IconCheck,
  IconCircleInfo,
  IconLock,
  IconPlus,
  IconSquareDottedArrowBottomRight,
  IconTrash,
  IconXmark,
} from 'nucleo-pixel-essential'
import { Input } from '~/components/input'
import { LoadingDots } from '~/components/loadingdots'
import { Modal } from '~/components/modal'
import { Select } from '~/components/select'
import {
  renameProject,
  deleteProject,
  forkEnvironment,
  deleteEnvironment,
  setEnvironmentLive,
} from '~/lib/project-settings-form'
import {
  grantTeamProjectPermission,
  changeTeamProjectPermission,
  revokeTeamProjectPermission,
} from '~/lib/teams-form'
import type { EnvRole } from '~/lib/project-settings-form'
import type { EnvPermissionView, OrgMemberView, ProjectSettingsView, TeamView, TeamEnvPermissionView, TeamProjectPermissionView } from '~/lib/orgs-server'
import type { Environment } from '~/lib/schema'

export type ProjectSettingsProps = {
  view: ProjectSettingsView
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function ProjectSettings({ view }: ProjectSettingsProps) {
  const { project, environments, envPermissions, members, teams, teamEnvPermissions, teamProjectPermissions, currentUserId, currentUserRole } = view
  const navigate = useNavigate()
  const router = useRouter()

  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin'

  function myEnvRole(envId: string): string {
    return envPermissions.find((p) => p.env_id === envId && p.user_id === currentUserId)?.role ?? ''
  }

  async function refresh() {
    await router.invalidate()
  }

  return (
    <div className="settings-sections">
      <GeneralSection project={project} canManage={canManage} onSaved={refresh} />
      <EnvironmentsSection
        project={project}
        environments={environments}
        envPermissions={envPermissions}
        members={members}
        teams={teams}
        teamEnvPermissions={teamEnvPermissions}
        teamProjectPermissions={teamProjectPermissions}
        canManage={canManage}
        myEnvRole={myEnvRole}
        onChanged={refresh}
      />
      <TeamAccessSection
        project={project}
        teams={teams}
        grants={teamProjectPermissions}
        canManage={canManage}
        onChanged={refresh}
      />
      {canManage && (
        <DangerSection
          project={project}
          onDeleted={() => void navigate({ to: '/dashboard/$orgId', params: { orgId: project.org_id } })}
        />
      )}
    </div>
  )
}

function GeneralSection({
  project,
  canManage,
  onSaved,
}: {
  project: ProjectSettingsView['project']
  canManage: boolean
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
      await renameProject(project.id, name)
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
          <p className="settings-section-desc">Basic details for this project.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="settings-form">
        <Input
          name="name"
          label="Project name"
          value={project.name}
          disabled={!canManage}
          required
        />
        <div className="settings-static">
          <span className="input-label">Project ID</span>
          <div className="settings-static-value">
            <code>{project.id}</code>
          </div>
          <span className="input-helper">
            Link a repo to this project from the CLI: shh link --project {project.id} - then shh pull / shh reload need no flags.
          </span>
        </div>
        {error && <span className="input-error">{error}</span>}
        {canManage && (
          <div className="settings-form-actions">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <LoadingDots /> : (
                <>
                  <IconCheck size={16} aria-hidden="true" />
                  Save changes
                </>
              )}
            </Button>
            {saved && <span className="settings-saved-note">Saved</span>}
          </div>
        )}
      </form>
    </section>
  )
}

function EnvironmentsSection({
  project,
  environments,
  envPermissions,
  members,
  teams,
  teamEnvPermissions,
  teamProjectPermissions,
  canManage,
  myEnvRole,
  onChanged,
}: {
  project: ProjectSettingsView['project']
  environments: Environment[]
  envPermissions: EnvPermissionView[]
  members: OrgMemberView[]
  teams: TeamView[]
  teamEnvPermissions: TeamEnvPermissionView[]
  teamProjectPermissions: TeamProjectPermissionView[]
  canManage: boolean
  myEnvRole: (envId: string) => string
  onChanged: () => Promise<void>
}) {
  const [forkingEnvId, setForkingEnvId] = useState('')
  const [managingEnvId, setManagingEnvId] = useState('')
  const [deletingEnvId, setDeletingEnvId] = useState('')

  const envName = (envId: string | null) => environments.find((e) => e.id === envId)?.name ?? ''
  const forkingEnv = environments.find((e) => e.id === forkingEnvId)
  const managingEnv = environments.find((e) => e.id === managingEnvId)
  const deletingEnv = environments.find((e) => e.id === deletingEnvId)

  return (
    <section className="card settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Environments</h2>
          <p className="settings-section-desc">
            Each environment is its own set of vars and secrets. Fork one to branch production into staging or a
            per-developer setup - you get full access on your fork. New environments are created from the project
            dashboard.
          </p>
        </div>
      </div>

      <div className="member-list">
        {environments.map((env) => {
          const canAdmin = canManage || myEnvRole(env.id) === 'admin'
          const canFork = canManage || myEnvRole(env.id) !== ''
          const parentName = envName(env.parent_env_id)
          const grants = envPermissions.filter((p) => p.env_id === env.id)
          return (
            <div key={env.id} className="member-row">
              <div className="member-row-info">
                <span className="member-row-email">
                  <EnvironmentTag name={env.name} live={env.is_live} />
                  {parentName && <Badge variant="neutral">fork of {parentName}</Badge>}
                </span>
                <span className="member-row-meta">
                  Created {formatDate(env.created_at)}
                  {grants.length > 0 && ` · ${grants.length} direct ${grants.length === 1 ? 'grant' : 'grants'}`}
                </span>
              </div>
              <div className="member-row-actions">
                {canFork && (
                  <Button size="sm" variant="ghost" onClick={() => setForkingEnvId(env.id)}>
                    <IconSquareDottedArrowBottomRight size={16} aria-hidden="true" />
                    Fork
                  </Button>
                )}
                {canAdmin && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void setEnvironmentLive(env.id, !env.is_live).then(() => onChanged())
                      }
                    >
                      <IconCircleInfo size={16} aria-hidden="true" />
                      {env.is_live ? 'Clear live marker' : 'Mark as live'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setManagingEnvId(env.id)}>
                      <IconLock size={16} aria-hidden="true" />
                      Access
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeletingEnvId(env.id)}>
                      <IconTrash size={16} aria-hidden="true" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          )
        })}
        {environments.length === 0 && (
          <p className="settings-section-desc">No environments yet.</p>
        )}
      </div>

      {forkingEnv && (
        <EnvNameModal
          title={`Fork ${forkingEnv.name}`}
          subtitle="Copies every var and secret into a new environment. You get full access on the fork; the parent is untouched."
          submitLabel="Fork environment"
          placeholder={`e.g. ${forkingEnv.name}-dev`}
          icon={<IconSquareDottedArrowBottomRight size={16} aria-hidden="true" />}
          onClose={() => setForkingEnvId('')}
          onSubmit={async (name) => {
            await forkEnvironment(project.id, forkingEnv.id, name)
            setForkingEnvId('')
            await onChanged()
          }}
        />
      )}

      {managingEnv && (
        <EnvAccessModal
          env={managingEnv}
          grants={envPermissions.filter((p) => p.env_id === managingEnv.id)}
          members={members}
          teams={teams}
          teamGrants={teamEnvPermissions.filter((p) => p.env_id === managingEnv.id)}
          projectTeamGrants={teamProjectPermissions}
          onClose={() => setManagingEnvId('')}
          onChanged={onChanged}
        />
      )}

      {deletingEnv && (
        <DeleteEnvModal
          env={deletingEnv}
          onClose={() => setDeletingEnvId('')}
          onDeleted={async () => {
            setDeletingEnvId('')
            await onChanged()
          }}
        />
      )}
    </section>
  )
}

function DeleteEnvModal({
  env,
  onClose,
  onDeleted,
}: {
  env: Environment
  onClose: () => void
  onDeleted: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setLoading(true)
    setError('')
    try {
      await deleteEnvironment(env.id)
      await onDeleted()
    } catch (err) {
      setError((err as Error).message || 'Failed to delete environment')
      setLoading(false)
    }
  }

  return (
    <Modal
      title={`Delete ${env.name}`}
      subtitle="Every var and secret in this environment is deleted with it. Recoverable for 90 days, then purged. Forks of this environment are not affected."
      onClose={onClose}
    >
      {error && <span className="input-error">{error}</span>}
      <div className="settings-modal-actions">
        <Button variant="secondary" size="md" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="danger" size="md" onClick={() => void handleDelete()} disabled={loading}>
          {loading ? <LoadingDots /> : (
            <>
              <IconTrash size={16} aria-hidden="true" />
              Delete environment
            </>
          )}
        </Button>
      </div>
    </Modal>
  )
}

// Project-level team grants: cover every environment in the project, present
// and future, forks included. Managing them is org owner/admin only - an env
// admin must not be able to widen access project-wide.
function TeamAccessSection({
  project,
  teams,
  grants,
  canManage,
  onChanged,
}: {
  project: ProjectSettingsView['project']
  teams: TeamView[]
  grants: TeamProjectPermissionView[]
  canManage: boolean
  onChanged: () => Promise<void>
}) {
  const [grantTeamId, setGrantTeamId] = useState('')
  const [grantRole, setGrantRole] = useState('read')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const grantableTeams = teams.filter((t) => !grants.some((g) => g.team_id === t.id))

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
    <section className="card settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Team access</h2>
          <p className="settings-section-desc">
            Project-wide grants for teams. They cover every environment in this project - including ones created or
            forked later. Only org owners and admins can change these; per-environment team grants live in each
            environment's Access dialog.
          </p>
        </div>
      </div>

      <div className="member-list">
        {grants.map((grant) => (
          <div key={grant.team_id} className="member-row">
            <Avatar name={grant.team_name} size="sm" />
            <div className="member-row-info">
              <span className="member-row-email">
                {grant.team_name}
                <Badge variant="neutral">team</Badge>
              </span>
            </div>
            <div className="member-row-actions">
              {canManage ? (
                <>
                  <Select
                    value={grant.role}
                    options={ENV_ROLE_OPTIONS}
                    onChange={(role) => void run(() => changeTeamProjectPermission(project.id, grant.team_id, role as EnvRole))}
                    disabled={busy}
                    className="member-role-select"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void run(() => revokeTeamProjectPermission(project.id, grant.team_id))}
                  >
                    <IconXmark size={16} aria-hidden="true" />
                    Revoke
                  </Button>
                </>
              ) : (
                <Badge variant="neutral">{grant.role}</Badge>
              )}
            </div>
          </div>
        ))}
        {grants.length === 0 && (
          <p className="settings-section-desc">
            {teams.length === 0
              ? 'No teams in this organization yet. Create them in the organization settings.'
              : 'No team has project-wide access yet.'}
          </p>
        )}
      </div>

      {canManage && grantableTeams.length > 0 && (
        <div className="settings-grant-form">
          <Select
            value={grantTeamId}
            options={grantableTeams.map((t) => ({ value: t.id, label: t.name }))}
            onChange={setGrantTeamId}
            placeholder="Select a team..."
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
            disabled={busy || !grantTeamId}
            onClick={() =>
              void run(async () => {
                await grantTeamProjectPermission(project.id, grantTeamId, grantRole as EnvRole)
                setGrantTeamId('')
              })
            }
          >
            <IconPlus size={16} aria-hidden="true" />
            Grant team
          </Button>
        </div>
      )}
      {error && <span className="input-error">{error}</span>}
    </section>
  )
}

function DangerSection({
  project,
  onDeleted,
}: {
  project: ProjectSettingsView['project']
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  return (
    <section className="card settings-section settings-section-danger">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Danger zone</h2>
          <p className="settings-section-desc">Owner and admin only. This affects everyone using the project.</p>
        </div>
      </div>

      <div className="danger-row">
        <div className="danger-row-info">
          <span className="danger-row-title">Delete project</span>
          <span className="danger-row-desc">
            Deletes every environment, var, and secret under it. Recoverable for 90 days, then purged.
          </span>
        </div>
        <Button size="sm" variant="danger" onClick={() => setDeleting(true)}>
          <IconTrash size={16} aria-hidden="true" />
          Delete
        </Button>
      </div>

      {deleting && (
        <DeleteProjectModal
          project={project}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      )}
    </section>
  )
}

function DeleteProjectModal({
  project,
  onClose,
  onDeleted,
}: {
  project: ProjectSettingsView['project']
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
      await deleteProject(project.id)
      onDeleted()
    } catch (err) {
      setError((err as Error).message || 'Failed to delete project')
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Delete project"
      subtitle={`This deletes every environment in ${project.name} for every member. Data is kept for 90 days, then permanently purged.`}
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="input-group">
          <label className="input-label" htmlFor="confirm-project-name">
            Type <strong>{project.name}</strong> to confirm
          </label>
          <input
            id="confirm-project-name"
            type="text"
            className="input-field"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={project.name}
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
            disabled={loading || confirmation !== project.name}
          >
            {loading ? <LoadingDots /> : (
              <>
                <IconTrash size={16} aria-hidden="true" />
                Delete project
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
