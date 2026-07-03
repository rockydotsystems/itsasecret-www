import { useState } from 'react'

export type SecretRowProps = {
  name: string
  value?: string
  meta?: string
}

export function SecretRow({ name, value, meta }: SecretRowProps) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="secret-row" data-secret-row>
      <div className="secret-row-info">
        <span className="secret-row-name">{name}</span>
        {meta && <span className="secret-row-synced">{meta}</span>}
      </div>
      <div className={`secret-row-value${revealed ? ' revealed' : ''}`}>
        {revealed && value !== undefined ? (
          <span>{value}</span>
        ) : (
          <span className="secret-masked">
            {Array.from({ length: 3 }).map((_, i) => (
              <span className="secret-masked-group" key={i}>
                {Array.from({ length: 4 }).map((_, j) => (
                  <span className="secret-masked-dot" key={j} />
                ))}
              </span>
            ))}
          </span>
        )}
        {value !== undefined && (
        <>
        <button
          type="button"
          className="secret-action"
          onClick={() => setRevealed(!revealed)}
          title={revealed ? 'Hide value' : 'Reveal value'}
        >
          {revealed ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l18 18" />
              <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7c1.4 0 2.6-.3 3.7-.8" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg>
          )}
        </button>
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
        </>
        )}
      </div>
    </div>
  )
}
