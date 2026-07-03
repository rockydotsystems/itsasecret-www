import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Avatar } from '~/components/avatar'
import { Badge } from '~/components/badge'
import { Button } from '~/components/button'
import { EnvironmentTag } from '~/components/environmenttag'
import { EnvNameModal } from '~/components/envnamemodal'
import { Input } from '~/components/input'
import { LoadingDots } from '~/components/loadingdots'
import { Modal } from '~/components/modal'
import { Select } from '~/components/select'
import {
  renameProject,
  deleteProject,
  forkEnvironment,
  deleteEnvironment,
  grantEnvPermission,
  changeEnvPermission,
  revokeEnvPermission,
} from '~/lib/project-settings-form'
import type { EnvRole } from '~/lib/project-settings-form'
import type { EnvPermissionView, OrgMemberView, ProjectSettingsView } from '~/lib/orgs-server'
import type { Environment } from '~/lib/schema'

export type ProjectSettingsProps = {
  view: ProjectSettingsView
}

const ENV_ROLE_OPTIONS = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'admin', label: 'Admin' },
]

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function ProjectSettings({ view }: ProjectSettingsProps) {
  const { project, environments, envPermissions, members, currentUserId, currentUserRole } = view
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
        canManage={canManage}
        myEnvRole={myEnvRole}
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
            Target this project from the CLI: shh pull --shell --project {project.id}
          </span>
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

function EnvironmentsSection({
  project,
  environments,
  envPermissions,
  members,
  canManage,
  myEnvRole,
  onChanged,
}: {
  project: ProjectSettingsView['project']
  environments: Environment[]
  envPermissions: EnvPermissionView[]
  members: OrgMemberView[]
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
            per-developer setup — you get full access on your fork. New environments are created from the project
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
                  <EnvironmentTag name={env.name} />
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
                    Fork
                  </Button>
                )}
                {canAdmin && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setManagingEnvId(env.id)}>
                      Access
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeletingEnvId(env.id)}>
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

function EnvAccessModal({
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
          {loading ? <LoadingDots /> : 'Delete environment'}
        </Button>
      </div>
    </Modal>
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
            {loading ? <LoadingDots /> : 'Delete project'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
