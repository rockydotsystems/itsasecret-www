import { useEffect, useState } from 'react'
import { Badge } from '~/components/badge'
import { Button } from '~/components/button'
import { LoadingDots } from '~/components/loadingdots'
import { Modal } from '~/components/modal'
import { Select } from '~/components/select'
import { listAccessTokens, createAccessToken, revokeAccessToken } from '~/lib/tokens-form'
import { IconCircleKey, IconClipboard } from 'nucleo-pixel-essential'
import type { AccessTokenSummary, CreatedAccessToken } from '~/lib/tokens-form'

// Lifetime choices: 30-day minimum, stepped up to the 2-year maximum, plus
// "does not expire" for machines that outlive any calendar.
const DURATION_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '1 year' },
  { value: '730', label: '2 years' },
  { value: 'never', label: 'Does not expire' },
]

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function expiryLabel(token: AccessTokenSummary): { text: string; expired: boolean } {
  if (token.expires_at === null) return { text: 'does not expire', expired: false }
  const expiresAt = new Date(token.expires_at)
  if (expiresAt.getTime() <= Date.now()) return { text: `expired ${formatDate(token.expires_at)}`, expired: true }
  return { text: `expires ${formatDate(token.expires_at)}`, expired: false }
}

export function AccessTokens() {
  const [tokens, setTokens] = useState<AccessTokenSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<AccessTokenSummary | null>(null)
  const [error, setError] = useState('')

  async function refresh() {
    try {
      setTokens(await listAccessTokens())
      setError('')
    } catch (err) {
      setError((err as Error).message || 'Failed to load access tokens')
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <section className="card settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Access tokens</h2>
          <p className="settings-section-desc">
            Long-lived tokens for headless machines: CI runners, servers, containers. Authenticate with{' '}
            <code>shh auth &lt;token&gt;</code> - no master password on the machine. A token can read exactly
            what your account can read today; revoke it here at any time.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <IconCircleKey size={16} aria-hidden="true" />
          New token
        </Button>
      </div>

      {error && <span className="input-error">{error}</span>}

      <div className="member-list">
        {tokens.map((token) => {
          const expiry = expiryLabel(token)
          return (
            <div key={token.id} className="member-row">
              <div className="member-row-info">
                <span className="member-row-email">
                  {token.name}
                  {expiry.expired && <Badge variant="warning">expired</Badge>}
                  {token.expires_at === null && <Badge variant="neutral">no expiry</Badge>}
                </span>
                <span className="member-row-meta">
                  Created {formatDate(token.created_at)} · {expiry.text}
                </span>
              </div>
              <div className="member-row-actions">
                <Button size="sm" variant="ghost" onClick={() => setRevoking(token)}>
                  Revoke
                </Button>
              </div>
            </div>
          )
        })}
        {loaded && tokens.length === 0 && (
          <p className="settings-section-desc">No access tokens yet.</p>
        )}
      </div>

      {creating && (
        <CreateTokenModal
          onClose={() => setCreating(false)}
          onCreated={refresh}
        />
      )}

      {revoking && (
        <RevokeTokenModal
          token={revoking}
          onClose={() => setRevoking(null)}
          onRevoked={async () => {
            setRevoking(null)
            await refresh()
          }}
        />
      )}
    </section>
  )
}

function CreateTokenModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [duration, setDuration] = useState('90')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedAccessToken | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    setBusy(true)
    setError('')
    try {
      const expiresInDays = duration === 'never' ? null : Number(duration)
      const token = await createAccessToken(name.trim(), expiresInDays)
      setCreated(token)
      await onCreated()
    } catch (err) {
      setError((err as Error).message || 'Failed to create access token')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!created) return
    await navigator.clipboard.writeText(created.token)
    setCopied(true)
  }

  if (created) {
    return (
      <Modal
        title={`Token "${created.name}" created`}
        subtitle="Copy it now - for your security it is shown exactly once and cannot be recovered later."
        onClose={onClose}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <pre className="docs-code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', userSelect: 'all' }}>
            {created.token}
          </pre>
          <p className="input-helper">
            On the headless machine, run: <code>shh auth {'<token>'}</code>
          </p>
          <div className="settings-modal-actions">
            <Button variant="secondary" size="md" onClick={onClose}>
              Done
            </Button>
            <Button variant="primary" size="md" onClick={() => void handleCopy()}>
              <IconClipboard size={16} aria-hidden="true" />
              {copied ? 'Copied' : 'Copy token'}
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title="New access token"
      subtitle="For headless machines. It inherits read access to everything your account can read; treat it like a password."
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="input-group">
          <label className="input-label" htmlFor="token-name">Name</label>
          <input
            id="token-name"
            type="text"
            className="input-field"
            placeholder="e.g. ci-runner"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="input-group">
          <span className="input-label">Expires</span>
          <Select value={duration} options={DURATION_OPTIONS} onChange={setDuration} />
        </div>
        {error && <span className="input-error">{error}</span>}
        <div className="settings-modal-actions">
          <Button variant="secondary" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={() => void handleCreate()} disabled={busy || !name.trim()}>
            {busy ? <LoadingDots /> : (
              <>
                <IconCircleKey size={16} aria-hidden="true" />
                Create token
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function RevokeTokenModal({
  token,
  onClose,
  onRevoked,
}: {
  token: AccessTokenSummary
  onClose: () => void
  onRevoked: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleRevoke() {
    setBusy(true)
    setError('')
    try {
      await revokeAccessToken(token.id)
      await onRevoked()
    } catch (err) {
      setError((err as Error).message || 'Failed to revoke token')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Revoke ${token.name}`}
      subtitle="Machines using this token lose access immediately. This cannot be undone."
      onClose={onClose}
    >
      {error && <span className="input-error">{error}</span>}
      <div className="settings-modal-actions">
        <Button variant="secondary" size="md" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" size="md" onClick={() => void handleRevoke()} disabled={busy}>
          {busy ? <LoadingDots /> : 'Revoke token'}
        </Button>
      </div>
    </Modal>
  )
}
