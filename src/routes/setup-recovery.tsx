import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/button'
import { LogoMark } from '~/components/logo'
import { LoadingDots } from '~/components/loadingdots'
import { RecoveryPhraseDisplay } from '~/components/recoveryphrase'
import { requireRecoverySetupBeforeLoad } from '~/lib/route-guards'
import { performLogout } from '~/lib/auth-form'

export const Route = createFileRoute('/setup-recovery')({
  beforeLoad: requireRecoverySetupBeforeLoad,
  component: SetupRecoveryPage,
})

// Forced setup for accounts created before recovery phrases existed. The user
// is already logged in - generating the phrase here satisfies "only a logged-in
// person can regenerate" for the very first phrase as well.
function SetupRecoveryPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [phrase, setPhrase] = useState<string | null>(null)
  const [confirmedSaved, setConfirmedSaved] = useState(false)

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const resp = await fetch('/api/auth/regenerate-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ revokeDevices: false, revokeOtherSessions: false }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Failed to generate recovery phrase')
      }
      const data = (await resp.json()) as { recoveryPhrase: string }
      setPhrase(data.recoveryPhrase)
    } catch (err) {
      setError('Error: ' + ((err as Error).message || 'unknown'))
    } finally {
      setLoading(false)
    }
  }

  function finish() {
    window.location.href = '/dashboard'
  }

  return (
    <div className="auth-page">
      <div className="card auth-card" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <LogoMark size={28} />
          <span style={{ font: '600 var(--text-xl)/var(--leading-snug) var(--font-family-display)', color: 'var(--text-primary)' }}>
            itsasecret
          </span>
        </div>
        {!phrase ? (
          <>
            <h1 className="auth-title">Set up your recovery phrase</h1>
            <p className="auth-subtitle">
              This account was created before recovery phrases existed. Generate one now to keep
              signing in from new devices. You can also do this at any time from your profile.
            </p>
            {error && <div className="auth-banner auth-banner-danger">{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Button size="lg" onClick={generate} disabled={loading}>
                {loading ? <LoadingDots /> : 'Generate my recovery phrase'}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => void performLogout()}>
                Log out and do this later
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="auth-title">Save your recovery phrase</h1>
            <p className="auth-subtitle">
              These 30 words are shown once and never stored anywhere readable. You will need them the
              first time you sign in on a new device.
            </p>
            <RecoveryPhraseDisplay phrase={phrase} />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', margin: '20px 0', font: '400 var(--text-sm)/1.5 var(--font-family-sans)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={confirmedSaved} onChange={(e) => setConfirmedSaved(e.target.checked)} style={{ marginTop: '3px' }} />
              I have written these words down somewhere safe
            </label>
            <Button size="lg" disabled={!confirmedSaved} onClick={finish}>
              Continue to dashboard
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
