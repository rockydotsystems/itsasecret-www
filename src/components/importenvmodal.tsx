import { useRef, useState } from 'react'
import { Button } from '~/components/button'
import { LoadingDots } from '~/components/loadingdots'
import { Modal } from '~/components/modal'
import { MaskedDots } from '~/components/secretrow'
import { parseDotenv } from '~/lib/dotenv-parse'
import type { SkippedEnvLine } from '~/lib/dotenv-parse'
import { setSecret, setVar } from '~/lib/env-items-form'
import { IconCheck, IconEyeClosed, IconEyeOpen, IconFile, IconLock, IconXmark } from 'nucleo-pixel-essential'

const MAX_FILE_BYTES = 1024 * 1024

export type ImportEnvModalProps = {
  orgId: string
  envId: string
  envName: string
  // Keys already in this environment - same-kind imports are flagged as overwrites.
  existingSecretKeys: string[]
  existingVarKeys: string[]
  // Prompts for the master password when the vault is locked.
  ensureUnlocked: () => Promise<void>
  onClose: () => void
  // Invalidates the dashboard after rows were imported.
  onImported: () => Promise<void>
}

type RowKind = 'secret' | 'var'

type ImportRow = {
  key: string
  value: string
  kind: RowKind
  revealed: boolean
  status: 'pending' | 'saving' | 'done' | 'error'
  error: string
}

function importLabel(secretCount: number, varCount: number): string {
  const parts: string[] = []
  if (secretCount > 0) parts.push(`${secretCount} ${secretCount === 1 ? 'secret' : 'secrets'}`)
  if (varCount > 0) parts.push(`${varCount} ${varCount === 1 ? 'variable' : 'variables'}`)
  return parts.join(' and ')
}

export function ImportEnvModal({
  orgId,
  envId,
  envName,
  existingSecretKeys,
  existingVarKeys,
  ensureUnlocked,
  onClose,
  onImported,
}: ImportEnvModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'source' | 'review' | 'done'>('source')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [skipped, setSkipped] = useState<SkippedEnvLine[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [imported, setImported] = useState<{ secrets: number; vars: number } | null>(null)

  const existingSecrets = new Set(existingSecretKeys)
  const existingVars = new Set(existingVarKeys)

  function requestClose() {
    if (busy) return
    if (imported) {
      void onImported().finally(onClose)
    } else {
      onClose()
    }
  }

  async function handleFileChosen(file: File) {
    setError('')
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is over 1 MB - too large for an env file.')
      return
    }
    setText(await file.text())
  }

  function startReview() {
    if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) {
      setError('That input is over 1 MB - too large for an env file.')
      return
    }
    const parsed = parseDotenv(text)
    if (parsed.entries.length === 0) {
      setError('No KEY=value pairs found in that input.')
      return
    }
    setError('')
    setSkipped(parsed.skipped)
    setRows(parsed.entries.map((e) => ({ key: e.key, value: e.value, kind: 'secret', revealed: false, status: 'pending', error: '' })))
    setStep('review')
  }

  function patchRow(index: number, patch: Partial<ImportRow>) {
    setRows((current) => current.map((row, j) => (j === index ? { ...row, ...patch } : row)))
  }

  const pendingRows = rows.filter((r) => r.status !== 'done')
  const pendingSecrets = pendingRows.filter((r) => r.kind === 'secret').length
  const pendingVars = pendingRows.length - pendingSecrets

  // Sequentially upserts every not-yet-imported row through the same endpoints
  // as one-by-one editing, so each key keeps normal history and audit entries.
  // Secrets are encrypted under the org key in this browser before upload.
  async function runImport() {
    setBusy(true)
    setError('')
    const snapshot = rows
    let failures = 0
    let importedSecrets = imported?.secrets ?? 0
    let importedVars = imported?.vars ?? 0
    try {
      if (pendingSecrets > 0) await ensureUnlocked()
      for (let i = 0; i < snapshot.length; i++) {
        const row = snapshot[i]
        if (row.status === 'done') continue
        patchRow(i, { status: 'saving', error: '' })
        try {
          if (row.kind === 'secret') {
            await setSecret(orgId, envId, row.key, row.value)
            importedSecrets++
          } else {
            await setVar(envId, row.key, row.value)
            importedVars++
          }
          patchRow(i, { status: 'done', value: '', revealed: false })
        } catch (err) {
          failures++
          patchRow(i, { status: 'error', error: (err as Error).message || 'Failed to save' })
        }
      }
      setImported({ secrets: importedSecrets, vars: importedVars })
      if (failures === 0) {
        setStep('done')
      } else {
        setError(`${failures} ${failures === 1 ? 'entry' : 'entries'} failed to import - the rest were saved. Fix and retry.`)
      }
    } catch (err) {
      setError((err as Error).message || 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const title = step === 'done' ? 'Import complete' : 'Import .env'

  return (
    <Modal
      title={title}
      subtitle={
        step === 'source'
          ? `Paste the file contents or pick the file - it's parsed entirely in this browser. Nothing leaves your machine until you confirm.`
          : step === 'review'
            ? `Everything defaults to an encrypted secret; flip a row to variable for plain config. Overwrites apply to existing ${envName} keys.`
            : undefined
      }
      wide={step === 'review'}
      onClose={requestClose}
    >
      {step === 'source' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="input-group">
            <label className="input-label" htmlFor="import-source">.env contents</label>
            <textarea
              id="import-source"
              className="input-field input-mono kv-value-field import-source-field"
              placeholder={'DATABASE_URL=postgres://…\n# stripe\nSTRIPE_SECRET_KEY=sk_live_…'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              autoFocus
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".env,.txt,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void handleFileChosen(file)
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <Button variant="secondary" size="md" onClick={() => fileInputRef.current?.click()}>
              <IconFile size={16} aria-hidden="true" />
              Choose file…
            </Button>
            <span className="import-note">Parsed locally - secrets are encrypted in your browser.</span>
          </div>
          {error && <span className="input-error">{error}</span>}
          <Button size="lg" disabled={!text.trim()} onClick={startReview}>
            Review import
          </Button>
        </div>
      )}

      {step === 'review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {skipped.length > 0 && (
            <div className="import-skipped">
              <p className="import-skipped-title">{skipped.length} {skipped.length === 1 ? 'line' : 'lines'} skipped</p>
              {skipped.map((s, i) => (
                <p key={`${s.line}-${i}`}>
                  <span className="import-skipped-line">L{s.line}</span> {s.text} - {s.reason}
                </p>
              ))}
            </div>
          )}

          <div className="import-review-list">
            {rows.map((row, i) => {
              const existing = row.kind === 'secret' ? existingSecrets.has(row.key) : existingVars.has(row.key)
              return (
                <div className="secret-row import-row" key={row.key}>
                  <div className="secret-row-info">
                    <span className="secret-row-name">{row.key}</span>
                    {row.status === 'error' ? (
                      <span className="input-error">{row.error}</span>
                    ) : row.status === 'done' ? (
                      <span className="secret-row-synced import-status-ok">
                        <IconCheck size={11} aria-hidden="true" /> imported
                      </span>
                    ) : (
                      <span className="secret-row-synced">{existing ? 'overwrites existing value' : 'new'}</span>
                    )}
                  </div>
                  <div className={`secret-row-value${row.revealed ? ' revealed' : ''}`}>
                    {row.revealed ? (
                      <span>{row.value === '' ? <em>(empty)</em> : row.value}</span>
                    ) : (
                      <MaskedDots />
                    )}
                    <button
                      type="button"
                      className="secret-action"
                      onClick={() => patchRow(i, { revealed: !row.revealed })}
                      title={row.revealed ? 'Hide value' : 'Reveal value'}
                    >
                      {row.revealed ? <IconEyeOpen size={16} aria-hidden="true" /> : <IconEyeClosed size={16} aria-hidden="true" />}
                    </button>
                    <span className="import-kind" role="radiogroup" aria-label={`Store ${row.key} as`}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={row.kind === 'secret'}
                        className={row.kind === 'secret' ? 'active' : ''}
                        disabled={busy || row.status === 'done'}
                        onClick={() => patchRow(i, { kind: 'secret' })}
                      >
                        <IconLock size={11} aria-hidden="true" />
                        secret
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={row.kind === 'var'}
                        className={row.kind === 'var' ? 'active' : ''}
                        disabled={busy || row.status === 'done'}
                        onClick={() => patchRow(i, { kind: 'var' })}
                      >
                        <IconFile size={11} aria-hidden="true" />
                        var
                      </button>
                    </span>
                    <button
                      type="button"
                      className="secret-action secret-action-danger"
                      disabled={busy || row.status === 'done'}
                      onClick={() => setRows((current) => current.filter((_, j) => j !== i))}
                      title="Exclude from import"
                    >
                      <IconXmark size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {error && <span className="input-error">{error}</span>}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
            <Button variant="ghost" size="md" disabled={busy} onClick={() => setStep('source')}>
              Back
            </Button>
            <Button size="lg" disabled={busy || pendingRows.length === 0} onClick={() => void runImport()}>
              {busy ? <LoadingDots /> : `Import ${importLabel(pendingSecrets, pendingVars)}`}
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && imported && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p className="import-note" style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)' }}>
            Saved {importLabel(imported.secrets, imported.vars) || 'nothing'} to {envName}. Secrets were encrypted
            under your org key before leaving this browser.
          </p>
          <Button size="lg" onClick={requestClose}>Done</Button>
        </div>
      )}
    </Modal>
  )
}
