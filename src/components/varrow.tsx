import { CopyIcon, PencilIcon, TrashIcon } from '~/components/secretrow'

export type VarRowProps = {
  name: string
  value: string
  meta?: string
  onEdit?: () => void
  onDelete?: () => void
}

// Plain (non-secret) env var: value is shown in the clear.
export function VarRow({ name, value, meta, onEdit, onDelete }: VarRowProps) {
  return (
    <div className="secret-row">
      <div className="secret-row-info">
        <span className="secret-row-name">{name}</span>
        {meta && <span className="secret-row-synced">{meta}</span>}
      </div>
      <div className="secret-row-value">
        <span className="var-row-plain">{value}</span>
        <button
          type="button"
          className="secret-action"
          onClick={() => navigator.clipboard.writeText(value)}
          title="Copy value"
        >
          {CopyIcon}
        </button>
        {onEdit && (
          <button type="button" className="secret-action" onClick={onEdit} title="Edit variable">
            {PencilIcon}
          </button>
        )}
        {onDelete && (
          <button type="button" className="secret-action secret-action-danger" onClick={onDelete} title="Delete variable">
            {TrashIcon}
          </button>
        )}
      </div>
    </div>
  )
}
