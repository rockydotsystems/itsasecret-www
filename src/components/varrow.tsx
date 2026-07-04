export type VarRowProps = {
  name: string
  value: string
  meta?: string
}

// Plain (non-secret) env var: value is shown in the clear, copy only.
export function VarRow({ name, value, meta }: VarRowProps) {
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
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
          </svg>
        </button>
      </div>
    </div>
  )
}
