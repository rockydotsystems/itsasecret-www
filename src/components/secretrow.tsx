import { useState } from 'react'

export type SecretRowProps = {
  name: string
  meta?: string
  // Static value for display-only rows (landing demo). Real rows use onReveal.
  value?: string
  // Fetches and decrypts the value client-side; may prompt for the master password.
  onReveal?: () => Promise<string>
  onEdit?: () => void
  onDelete?: () => void
  onHistory?: () => void
}

export const EyeIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const EyeOffIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3l18 18" />
    <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7c1.4 0 2.6-.3 3.7-.8" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
)

export const CopyIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
)

export const PencilIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
)

export const TrashIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

export const RestoreIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

export const ClockIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
)

export function MaskedDots() {
  return (
    <span className="secret-masked">
      {Array.from({ length: 3 }).map((_, i) => (
        <span className="secret-masked-group" key={i}>
          {Array.from({ length: 4 }).map((_, j) => (
            <span className="secret-masked-dot" key={j} />
          ))}
        </span>
      ))}
    </span>
  )
}

export function SecretRow({ name, meta, value: staticValue, onReveal, onEdit, onDelete, onHistory }: SecretRowProps) {
  const [revealed, setRevealed] = useState(false)
  const [value, setValue] = useState<string | null>(staticValue ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function fetchValue(): Promise<string | null> {
    if (value !== null) return value
    if (!onReveal) return null
    setBusy(true)
    setError('')
    try {
      const plaintext = await onReveal()
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

  return (
    <div className="secret-row" data-secret-row>
      <div className="secret-row-info">
        <span className="secret-row-name">{name}</span>
        {meta && <span className="secret-row-synced">{meta}</span>}
      </div>
      <div className={`secret-row-value${revealed ? ' revealed' : ''}`}>
        {error && <span className="input-error">{error}</span>}
        {revealed && value !== null ? (
          <span>{value}</span>
        ) : (
          <MaskedDots />
        )}
        {(onReveal || staticValue !== undefined) && (
          <>
            <button
              type="button"
              className="secret-action"
              onClick={() => void handleToggleReveal()}
              disabled={busy}
              title={revealed ? 'Hide value' : 'Reveal value'}
            >
              {revealed ? EyeIcon : EyeOffIcon}
            </button>
            <button
              type="button"
              className="secret-action"
              onClick={() => void handleCopy()}
              disabled={busy}
              title="Copy value"
            >
              {CopyIcon}
            </button>
          </>
        )}
        {onHistory && (
          <button type="button" className="secret-action" onClick={onHistory} title="View history">
            {ClockIcon}
          </button>
        )}
        {onEdit && (
          <button type="button" className="secret-action" onClick={onEdit} title="Edit secret">
            {PencilIcon}
          </button>
        )}
        {onDelete && (
          <button type="button" className="secret-action secret-action-danger" onClick={onDelete} title="Delete secret">
            {TrashIcon}
          </button>
        )}
      </div>
    </div>
  )
}
