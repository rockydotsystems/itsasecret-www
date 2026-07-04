import { useRef, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '~/components/button'
import { Modal } from '~/components/modal'
import { SecretRow } from '~/components/secretrow'
import { VarRow } from '~/components/varrow'
import { EnvironmentTag } from '~/components/environmenttag'
import { EnvNameModal } from '~/components/envnamemodal'
import { KeyValueModal } from '~/components/keyvaluemodal'
import { MasterPassModal } from '~/components/masterpassmodal'
import { HistoryModal } from '~/components/historymodal'
import type { HistoryModalEntry } from '~/components/historymodal'
import { DashboardTopBar } from '~/components/dashboardtopbar'
import { createEnvironment } from '~/lib/project-settings-form'
import {
  setSecret, setVar, deleteSecret, deleteVar, revealSecret,
  fetchSecretHistory, fetchVarHistory, decryptSecretHistoryValue,
} from '~/lib/env-items-form'
import { isVaultUnlocked, VaultLockedError } from '~/lib/vault'
import type { SecretSummary, VarSummary } from '~/lib/orgs-server'
import type { Environment, Org, Project } from '~/lib/schema'

export type DashboardShellProps = {
  orgs: Org[]
  orgId: string
  projects: Project[]
  projectId: string
  environments: Environment[]
  envId: string
  currentUserRole?: string
  envRole?: string
  envSecrets?: SecretSummary[]
  envVars?: VarSummary[]
}

type EditingItem = { type: 'secret' | 'var'; itemKey: string; initialValue: string }
type DeletingItem = { type: 'secret' | 'var'; itemKey: string }
type HistoryItem = { type: 'secret' | 'var'; itemKey: string }
type UnlockRequest = { resolve: () => void; reject: (err: Error) => void }

function formatUpdated(date: Date | string): string {
  return `updated ${new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
}

// Redacted .env file, in the brand's redaction-bars motif.
function EmptyEnvGraphic() {
  const rows = [
    { key: 34, value: 72 },
    { key: 46, value: 96 },
    { key: 28, value: 58, accent: true },
    { key: 52, value: 80 },
    { key: 38, value: 64 },
  ]
  return (
    <svg width="240" height="150" viewBox="0 0 240 150" fill="none" aria-hidden="true" className="env-empty-graphic">
      <rect x="1" y="1" width="238" height="148" rx="12" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="6 6" />
      <circle cx="22" cy="18" r="4" fill="var(--ink-700)" />
      <circle cx="36" cy="18" r="4" fill="var(--ink-700)" />
      <circle cx="50" cy="18" r="4" fill="var(--ink-700)" />
      {rows.map((row, i) => {
        const y = 40 + i * 20
        const fill = row.accent ? 'var(--signal-400)' : 'var(--ink-600)'
        const valueFill = row.accent ? 'var(--signal-400)' : 'var(--ink-700)'
        return (
          <g key={i}>
            <rect x="20" y={y} width={row.key} height="9" rx="4.5" fill={fill} />
            <rect x={20 + row.key + 10} y={y} width="9" height="9" rx="2" fill="var(--ink-800)" />
            <rect x={20 + row.key + 27} y={y} width={row.value} height="9" rx="4.5" fill={valueFill} opacity={row.accent ? 0.55 : 1} />
          </g>
        )
      })}
    </svg>
  )
}

export function DashboardShell({
  orgs,
  orgId,
  projects,
  projectId,
  environments,
  envId,
  currentUserRole = '',
  envRole = '',
  envSecrets = [],
  envVars = [],
}: DashboardShellProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const [creatingEnv, setCreatingEnv] = useState(false)
  const [creatingItem, setCreatingItem] = useState<'secret' | 'var' | null>(null)
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<DeletingItem | null>(null)
  const [historyItem, setHistoryItem] = useState<HistoryItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [unlockRequest, setUnlockRequest] = useState<UnlockRequest | null>(null)
  const unlockPromiseRef = useRef<Promise<void> | null>(null)

  const projectName = projects.find((p) => p.id === projectId)?.name || 'Select project'
  const envName = environments.find((e) => e.id === envId)?.name ?? ''
  // Only org owners and admins can create environments from scratch.
  const canCreateEnv = !!projectId && (currentUserRole === 'owner' || currentUserRole === 'admin')
  const canWrite = envRole === 'write' || envRole === 'admin'
  const envIsEmpty = envSecrets.length === 0 && envVars.length === 0

  // Resolves once the vault is unlocked, prompting for the master password
  // when needed. Rejects when the user dismisses the prompt. Concurrent
  // callers share one prompt — a second request must not replace the first
  // one's resolve/reject and leave it hanging.
  async function ensureUnlocked(): Promise<void> {
    if (await isVaultUnlocked()) return
    if (!unlockPromiseRef.current) {
      const prompt = new Promise<void>((resolve, reject) => {
        setUnlockRequest({ resolve, reject })
      })
      unlockPromiseRef.current = prompt
      void prompt.catch(() => {}).then(() => {
        unlockPromiseRef.current = null
      })
    }
    return unlockPromiseRef.current
  }

  // Runs a client-side decrypt after making sure the vault is unlocked; if the
  // cached master key went stale (e.g. password changed), prompt and retry.
  async function withVaultRetry<T>(fn: () => Promise<T>): Promise<T> {
    await ensureUnlocked()
    try {
      return await fn()
    } catch (err) {
      if (err instanceof VaultLockedError) {
        await ensureUnlocked()
        return fn()
      }
      throw err
    }
  }

  function revealValueFor(key: string): Promise<string> {
    return withVaultRetry(() => revealSecret(orgId, envId, key))
  }

  // History entries for the modal: secrets decrypt per-entry in the browser,
  // vars arrive as plaintext (same trust level as their live values).
  // Restore reapplies a snapshot through the normal upsert, which snapshots
  // the value being replaced — so a restore is itself undoable.
  async function loadHistoryEntries(item: HistoryItem): Promise<HistoryModalEntry[]> {
    async function finishRestore() {
      setHistoryItem(null)
      await router.invalidate()
    }
    if (item.type === 'secret') {
      const entries = await fetchSecretHistory(envId, item.itemKey)
      return entries.map((e) => ({
        id: e.id,
        changeType: e.change_type,
        changedBy: e.changed_by,
        createdAt: e.created_at,
        reveal: () => withVaultRetry(() => decryptSecretHistoryValue(orgId, e.encrypted_value)),
        restore: canWrite
          ? async () => {
              await withVaultRetry(async () => {
                const plaintext = await decryptSecretHistoryValue(orgId, e.encrypted_value)
                await setSecret(orgId, envId, item.itemKey, plaintext)
              })
              await finishRestore()
            }
          : undefined,
      }))
    }
    const entries = await fetchVarHistory(envId, item.itemKey)
    return entries.map((e) => ({
      id: e.id,
      changeType: e.change_type,
      changedBy: e.changed_by,
      createdAt: e.created_at,
      value: e.value,
      restore: canWrite
        ? async () => {
            await setVar(envId, item.itemKey, e.value)
            await finishRestore()
          }
        : undefined,
    }))
  }

  async function startEditSecret(key: string) {
    setActionError('')
    try {
      await ensureUnlocked()
      const currentValue = await revealSecret(orgId, envId, key)
      setEditingItem({ type: 'secret', itemKey: key, initialValue: currentValue })
    } catch (err) {
      const message = (err as Error).message || 'Failed to open secret'
      if (message !== 'Unlock cancelled') setActionError(message)
    }
  }

  async function confirmDelete() {
    if (!deletingItem) return
    setDeleteBusy(true)
    setActionError('')
    try {
      if (deletingItem.type === 'secret') {
        await deleteSecret(envId, deletingItem.itemKey)
      } else {
        await deleteVar(envId, deletingItem.itemKey)
      }
      setDeletingItem(null)
      await router.invalidate()
    } catch (err) {
      setActionError((err as Error).message || 'Failed to delete')
      setDeletingItem(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  function handleEnvChange(nextEnvId: string) {
    if (nextEnvId === envId) return
    void navigate({
      to: '/dashboard/$orgId/$projectId',
      params: { orgId, projectId },
      search: { env: nextEnvId },
    })
  }

  const subtitle = [
    `${envSecrets.length} ${envSecrets.length === 1 ? 'secret' : 'secrets'}`,
    `${envVars.length} ${envVars.length === 1 ? 'var' : 'vars'}`,
    `${environments.length} ${environments.length === 1 ? 'environment' : 'environments'}`,
  ].join(' · ')

  const envTagRow = (
    <div className="app-actions">
      <div style={{ display: 'flex', gap: '8px' }}>
        {environments.map((env) => (
          <EnvironmentTag
            key={env.id}
            name={env.name}
            active={env.id === envId}
            onClick={() => handleEnvChange(env.id)}
          />
        ))}
        {canCreateEnv && (
          <button
            type="button"
            className="env-tag env-tag-add"
            onClick={() => setCreatingEnv(true)}
            aria-label="Create new environment"
          >
            + new
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="app-shell">
      <DashboardTopBar orgs={orgs} orgId={orgId} projects={projects} projectId={projectId} />

      <main className="app-main">
        {!projectId ? (
          <div className="env-empty">
            <EmptyEnvGraphic />
            <h2 className="env-empty-title">No projects yet</h2>
            <p className="env-empty-desc">
              Projects group the environments your secrets live in. Create one from the project menu above.
            </p>
          </div>
        ) : environments.length === 0 ? (
          <>
            <div className="app-meta">
              <h1 className="app-title">{projectName}</h1>
              <span className="app-subtitle">0 environments</span>
            </div>
            <div className="env-empty">
              <EmptyEnvGraphic />
              <h2 className="env-empty-title">No environments yet</h2>
              <p className="env-empty-desc">
                Environments hold this project's vars and secrets — production first, then fork it into staging and
                per-developer setups.
              </p>
              {canCreateEnv ? (
                <Button size="lg" onClick={() => setCreatingEnv(true)}>
                  Create your first environment
                </Button>
              ) : (
                <p className="env-empty-hint">Ask an org owner or admin to create it.</p>
              )}
            </div>
          </>
        ) : envIsEmpty ? (
          <>
            <div className="app-meta">
              <h1 className="app-title">{projectName}</h1>
              <span className="app-subtitle">{subtitle}</span>
            </div>
            {envTagRow}
            <div className="env-empty">
              <EmptyEnvGraphic />
              <h2 className="env-empty-title">Nothing in {envName} yet</h2>
              <p className="env-empty-desc">
                Secrets are encrypted end-to-end; plain variables are stored as-is. The CLI pulls both into your shell
                or .env file.
              </p>
              {canWrite ? (
                <div className="env-empty-actions">
                  <Button size="lg" onClick={() => setCreatingItem('secret')}>
                    Create your first secret
                  </Button>
                  <Button size="lg" variant="secondary" onClick={() => setCreatingItem('var')}>
                    Create your first variable
                  </Button>
                </div>
              ) : (
                <p className="env-empty-hint">You have read-only access to this environment.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="app-meta">
              <h1 className="app-title">{projectName}</h1>
              <span className="app-subtitle">{subtitle}</span>
            </div>
            {envTagRow}
            {actionError && <span className="input-error">{actionError}</span>}

            <div className="env-section">
              <div className="env-section-header">
                <h2 className="env-section-title">Secrets</h2>
                {canWrite && (
                  <Button size="sm" variant="secondary" onClick={() => setCreatingItem('secret')}>
                    New secret
                  </Button>
                )}
              </div>
              {envSecrets.length > 0 ? (
                <div className="env-section-rows">
                  {envSecrets.map((s) => (
                    <SecretRow
                      // updated_at in the key remounts the row on edit, dropping
                      // its cached decrypted value so reveal fetches the new one.
                      key={`${s.key}:${new Date(s.updated_at).getTime()}`}
                      name={s.key}
                      meta={formatUpdated(s.updated_at)}
                      onReveal={() => revealValueFor(s.key)}
                      onHistory={() => setHistoryItem({ type: 'secret', itemKey: s.key })}
                      onEdit={canWrite ? () => void startEditSecret(s.key) : undefined}
                      onDelete={canWrite ? () => setDeletingItem({ type: 'secret', itemKey: s.key }) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <p className="env-no-secrets">No secrets in this environment yet.</p>
              )}
            </div>

            <div className="env-section">
              <div className="env-section-header">
                <h2 className="env-section-title">Variables</h2>
                {canWrite && (
                  <Button size="sm" variant="secondary" onClick={() => setCreatingItem('var')}>
                    New variable
                  </Button>
                )}
              </div>
              {envVars.length > 0 ? (
                <div className="env-section-rows">
                  {envVars.map((v) => (
                    <VarRow
                      key={v.key}
                      name={v.key}
                      value={v.value}
                      meta={formatUpdated(v.updated_at)}
                      onHistory={() => setHistoryItem({ type: 'var', itemKey: v.key })}
                      onEdit={canWrite ? () => setEditingItem({ type: 'var', itemKey: v.key, initialValue: v.value }) : undefined}
                      onDelete={canWrite ? () => setDeletingItem({ type: 'var', itemKey: v.key }) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <p className="env-no-secrets">No plain variables in this environment yet.</p>
              )}
            </div>
          </>
        )}
      </main>

      {creatingEnv && (
        <EnvNameModal
          title="New environment"
          subtitle="Creates an empty environment in this project. To branch an existing one instead, fork it from project settings."
          submitLabel="Create environment"
          placeholder="e.g. production"
          onClose={() => setCreatingEnv(false)}
          onSubmit={async (name) => {
            const env = await createEnvironment(projectId, name)
            setCreatingEnv(false)
            void navigate({
              to: '/dashboard/$orgId/$projectId',
              params: { orgId, projectId },
              search: { env: env.id },
            })
          }}
        />
      )}

      {creatingItem === 'secret' && (
        <KeyValueModal
          title="New secret"
          subtitle={`Encrypted in your browser under ${envName}'s org key before it's sent — the server never sees the value.`}
          submitLabel="Save secret"
          keyPlaceholder="e.g. STRIPE_SECRET_KEY"
          valuePlaceholder="sk_live_..."
          onClose={() => setCreatingItem(null)}
          onSubmit={async (key, value) => {
            await ensureUnlocked()
            await setSecret(orgId, envId, key, value)
            setCreatingItem(null)
            await router.invalidate()
          }}
        />
      )}

      {creatingItem === 'var' && (
        <KeyValueModal
          title="New variable"
          subtitle={`Plain, unencrypted value in ${envName} — for config that isn't sensitive.`}
          submitLabel="Save variable"
          keyPlaceholder="e.g. LOG_LEVEL"
          valuePlaceholder="debug"
          onClose={() => setCreatingItem(null)}
          onSubmit={async (key, value) => {
            await setVar(envId, key, value)
            setCreatingItem(null)
            await router.invalidate()
          }}
        />
      )}

      {editingItem?.type === 'secret' && (
        <KeyValueModal
          title="Edit secret"
          subtitle={`Encrypted in your browser under ${envName}'s org key before it's sent — the server never sees the value.`}
          submitLabel="Save secret"
          keyPlaceholder=""
          valuePlaceholder="sk_live_..."
          initialKey={editingItem.itemKey}
          initialValue={editingItem.initialValue}
          onClose={() => setEditingItem(null)}
          onSubmit={async (key, value) => {
            await ensureUnlocked()
            await setSecret(orgId, envId, key, value)
            setEditingItem(null)
            await router.invalidate()
          }}
        />
      )}

      {editingItem?.type === 'var' && (
        <KeyValueModal
          title="Edit variable"
          subtitle={`Plain, unencrypted value in ${envName} — for config that isn't sensitive.`}
          submitLabel="Save variable"
          keyPlaceholder=""
          valuePlaceholder="debug"
          initialKey={editingItem.itemKey}
          initialValue={editingItem.initialValue}
          onClose={() => setEditingItem(null)}
          onSubmit={async (key, value) => {
            await setVar(envId, key, value)
            setEditingItem(null)
            await router.invalidate()
          }}
        />
      )}

      {deletingItem && (
        <Modal
          title={deletingItem.type === 'secret' ? 'Delete secret' : 'Delete variable'}
          subtitle={`${deletingItem.itemKey} will be removed from ${envName}. Its encrypted history is kept for 7 days.`}
          onClose={() => setDeletingItem(null)}
        >
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="md" onClick={() => setDeletingItem(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={() => void confirmDelete()} disabled={deleteBusy}>
              {deletingItem.type === 'secret' ? 'Delete secret' : 'Delete variable'}
            </Button>
          </div>
        </Modal>
      )}

      {historyItem && (
        <HistoryModal
          itemKey={historyItem.itemKey}
          kind={historyItem.type}
          loadEntries={() => loadHistoryEntries(historyItem)}
          onClose={() => setHistoryItem(null)}
        />
      )}

      {unlockRequest && (
        <MasterPassModal
          orgId={orgId}
          onUnlocked={() => {
            unlockRequest.resolve()
            setUnlockRequest(null)
          }}
          onClose={() => {
            unlockRequest.reject(new Error('Unlock cancelled'))
            setUnlockRequest(null)
          }}
        />
      )}
    </div>
  )
}
