import { useEffect, useState } from 'react'
import { LoadingDots } from '~/components/loadingdots'
import { Modal } from '~/components/modal'
import { CopyIcon, EyeIcon, EyeOffIcon, MaskedDots, RestoreIcon } from '~/components/secretrow'

export type HistoryModalEntry = {
  id: string
  changeType: string
  changedBy: string
  createdAt: string
  // Plain vars carry the value directly; secrets decrypt on demand client-side.
  value?: string
  reveal?: () => Promise<string>
  // Reapplies this snapshot as the current value (write role only). The upsert
  // snapshots the value being replaced, so a restore is itself undoable.
  restore?: () => Promise<void>
}

export type HistoryModalProps = {
  itemKey: string
  kind: 'secret' | 'var'
  loadEntries: () => Promise<HistoryModalEntry[]>
  onClose: () => void
}

function formatWhen(date: string): string {
  return new Date(date).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// One history snapshot: the value as it was before the change.
function HistoryRow({ entry }: { entry: HistoryModalEntry }) {
  const [revealed, setRevealed] = useState(false)
  const [value, setValue] = useState<string | null>(entry.value ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isSecret = entry.reveal !== undefined

  async function fetchValue(): Promise<string | null> {
    if (value !== null) return value
    if (!entry.reveal) return null
    setBusy(true)
    setError('')
    try {
      const plaintext = await entry.reveal()
      setValue(plaintext)
      return plaintext
    } catch (err) {
      setError((err as Error).message || 'Failed to decrypt')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleReveal() {
    if (revealed) {
      setRevealed(false)
      return
    }
    const plaintext = await fetchValue()
    if (plaintext !== null) setRevealed(true)
  }

  async function handleCopy() {
    const plaintext = await fetchValue()
    if (plaintext !== null) await navigator.clipboard.writeText(plaintext)
  }

  async function handleRestore() {
    if (!entry.restore) return
    setBusy(true)
    setError('')
    try {
      await entry.restore()
    } catch (err) {
      setError((err as Error).message || 'Failed to restore')
      setBusy(false)
    }
  }

  return (
    <div className="history-row">
      <div className="history-row-meta">
        <span className={`history-change history-change-${entry.changeType}`}>
          {entry.changeType === 'delete' ? 'deleted' : 'updated'}
        </span>
        <span className="history-row-who">by {entry.changedBy} · {formatWhen(entry.createdAt)}</span>
      </div>
      <div className="secret-row-value">
        {error && <span className="input-error">{error}</span>}
        {!isSecret || (revealed && value !== null) ? (
          <span className="var-row-plain">{value}</span>
        ) : (
          <MaskedDots />
        )}
        {isSecret && (
          <button
            type="button"
            className="secret-action"
            onClick={() => void handleToggleReveal()}
            disabled={busy}
            title={revealed ? 'Hide value' : 'Reveal value'}
          >
            {revealed ? EyeIcon : EyeOffIcon}
          </button>
        )}
        <button
          type="button"
          className="secret-action"
          onClick={() => void handleCopy()}
          disabled={busy}
          title="Copy value"
        >
          {CopyIcon}
        </button>
        {entry.restore && (
          <button
            type="button"
            className="secret-action"
            onClick={() => void handleRestore()}
            disabled={busy}
            title="Restore this value"
          >
            {RestoreIcon}
          </button>
        )}
      </div>
    </div>
  )
}

// Shows the encrypted 7-day change history of a secret or var. Each entry is
// the value as it was right before that change.
export function HistoryModal({ itemKey, kind, loadEntries, onClose }: HistoryModalProps) {
  const [entries, setEntries] = useState<HistoryModalEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    loadEntries()
      .then((loaded) => {
        if (!cancelled) setEntries(loaded)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message || 'Failed to load history')
      })
    return () => {
      cancelled = true
    }
    // Load once per modal open; the callback identity churns per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const subtitle = kind === 'secret'
    ? 'Previous values from the last 7 days, decrypted in your browser. Older history is purged.'
    : 'Previous values from the last 7 days. Older history is purged.'

  return (
    <Modal title={`History — ${itemKey}`} subtitle={subtitle} onClose={onClose}>
      {error ? (
        <span className="input-error">{error}</span>
      ) : entries === null ? (
        <div className="history-loading"><LoadingDots /></div>
      ) : entries.length === 0 ? (
        <p className="env-no-secrets">No changes in the last 7 days.</p>
      ) : (
        <div className="history-list">
          {entries.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </Modal>
  )
}
