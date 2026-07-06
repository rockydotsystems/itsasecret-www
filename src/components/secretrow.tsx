import { useState } from 'react'
import {
  IconArrowDottedRotateAnticlockwise,
  IconCircleHalfDottedClock,
  IconClipboard,
  IconEyeClosed,
  IconEyeOpen,
  IconPenWriting,
  IconTrash,
} from 'nucleo-pixel-essential'

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

export const EyeIcon = <IconEyeOpen size={16} aria-hidden="true" />

export const EyeOffIcon = <IconEyeClosed size={16} aria-hidden="true" />

export const CopyIcon = <IconClipboard size={16} aria-hidden="true" />

export const PencilIcon = <IconPenWriting size={16} aria-hidden="true" />

export const TrashIcon = <IconTrash size={16} aria-hidden="true" />

export const RestoreIcon = <IconArrowDottedRotateAnticlockwise size={16} aria-hidden="true" />

export const ClockIcon = <IconCircleHalfDottedClock size={16} aria-hidden="true" />

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
