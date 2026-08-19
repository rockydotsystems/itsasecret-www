import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Avatar } from '~/components/avatar'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LoadingDots } from '~/components/loadingdots'
import { updateProfileName, changePassword, submitFeedback } from '~/lib/profile-form'
import { RecoveryPhraseDisplay } from '~/components/recoveryphrase'
import { IconCheck, IconLockCircleOpen, IconPaperPlane2 } from 'nucleo-pixel-essential'

export type ProfileSettingsProps = {
  email: string
  name: string | null
}

export function ProfileSettings({ email, name }: ProfileSettingsProps) {
  return (
    <>
      <ProfileSection email={email} name={name} />
      <PasswordSection />
      <RecoveryPhraseSection />
      <FeedbackSection />
    </>
  )
}

// The recovery phrase is the device-trust second factor: it is shown exactly
// once (here, at rotation time) and is never recoverable from the server.
function RecoveryPhraseSection() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [phrase, setPhrase] = useState<string | null>(null)
  const [revokeDevices, setRevokeDevices] = useState(false)
  const [revokeSessions, setRevokeSessions] = useState(false)
  const [confirmedSaved, setConfirmedSaved] = useState(false)

  async function rotate() {
    setBusy(true)
    setError('')
    setPhrase(null)
    try {
      const resp = await fetch('/api/auth/regenerate-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ revokeDevices, revokeOtherSessions: revokeSessions }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Failed to rotate recovery phrase')
      }
      const data = (await resp.json()) as { recoveryPhrase: string }
      setPhrase(data.recoveryPhrase)
      setConfirmedSaved(false)
    } catch (err) {
      setError((err as Error).message || 'Failed to rotate recovery phrase')
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    setPhrase(null)
    setConfirmedSaved(false)
    setRevokeDevices(false)
    setRevokeSessions(false)
  }

  return (
    <section className="card settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Recovery phrase</h2>
          <p className="settings-section-desc">
            The 30-word phrase proves it is you the first time a new machine signs in. Rotating
            replaces the old phrase immediately. Your other devices keep working unless you revoke
            them below.
          </p>
        </div>
      </div>

      {phrase ? (
        <div>
          <RecoveryPhraseDisplay phrase={phrase} />
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', margin: '20px 0', font: '400 var(--text-sm)/1.5 var(--font-family-sans)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmedSaved} onChange={(e) => setConfirmedSaved(e.target.checked)} style={{ marginTop: '3px' }} />
            I have written these words down somewhere safe - they will not be shown again
          </label>
          <Button type="button" size="md" disabled={!confirmedSaved} onClick={dismiss}>
            Done
          </Button>
        </div>
      ) : (
        <div className="profile-form">
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', font: '400 var(--text-sm)/1.5 var(--font-family-sans)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={revokeDevices} onChange={(e) => setRevokeDevices(e.target.checked)} style={{ marginTop: '3px' }} />
            Also revoke all trusted devices (everyone must reenter the phrase on next login)
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', font: '400 var(--text-sm)/1.5 var(--font-family-sans)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={revokeSessions} onChange={(e) => setRevokeSessions(e.target.checked)} style={{ marginTop: '3px' }} />
            Also sign out of every other session - yes, revoke all other instances
          </label>
          {error && <span className="input-error">{error}</span>}
          <div className="settings-modal-actions">
            <Button type="button" size="md" variant="secondary" disabled={busy} onClick={rotate}>
              {busy ? <LoadingDots /> : 'Rotate recovery phrase'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function ProfileSection({ email, name }: ProfileSettingsProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const nextName = (new FormData(form).get('profile-name') as string) ?? ''
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      await updateProfileName(nextName)
      setSaved(true)
      // Refresh route context so the top bar avatar/name pick up the change.
      await router.invalidate()
    } catch (err) {
      setError((err as Error).message || 'Failed to update profile')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Profile</h2>
          <p className="settings-section-desc">
            Your name is shown to teammates in shared organizations. The picture comes from{' '}
            <a href="https://gravatar.com" target="_blank" rel="noreferrer">Gravatar</a> for your account
            email; without one you get a generated stand-in.
          </p>
        </div>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="profile-form">
        <div className="profile-identity">
          <Avatar name={name || email} email={email} size="lg" />
          <div className="input-group">
            <span className="input-label">Email</span>
            <input type="email" className="input-field" value={email} disabled readOnly />
          </div>
        </div>
        <Input
          name="profile-name"
          label="Name"
          placeholder="e.g. Ada Lovelace"
          value={name ?? ''}
        />
        {error && <span className="input-error">{error}</span>}
        <div className="settings-modal-actions">
          {saved && <span className="input-helper">Saved.</span>}
          <Button type="submit" size="md" disabled={busy}>
            {busy ? <LoadingDots /> : (
              <>
                <IconCheck size={16} aria-hidden="true" />
                Save profile
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  )
}

function PasswordSection() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const current = data.get('current-password') as string
    const next = data.get('new-password') as string
    const confirm = data.get('confirm-password') as string

    setError('')
    setDone(false)
    if (next.length < 12) {
      setError('New password must be at least 12 characters')
      return
    }
    if (next !== confirm) {
      setError('New passwords do not match')
      return
    }

    setBusy(true)
    try {
      await changePassword(current, next)
      setDone(true)
      form.reset()
    } catch (err) {
      setError((err as Error).message || 'Failed to change password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Master password</h2>
          <p className="settings-section-desc">
            Changing it re-wraps your organization keys under the new password and signs you out
            everywhere else (web and CLI). Access tokens keep working. Your secrets are untouched.
          </p>
        </div>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="profile-form">
        <Input
          name="current-password"
          label="Current password"
          type="password"
          required
        />
        <Input
          name="new-password"
          label="New password"
          type="password"
          helperText="At least 12 characters."
          required
        />
        <Input
          name="confirm-password"
          label="Confirm new password"
          type="password"
          required
        />
        {error && <span className="input-error">{error}</span>}
        <div className="settings-modal-actions">
          {done && <span className="input-helper">Password changed. Other sessions were signed out.</span>}
          <Button type="submit" size="md" disabled={busy}>
            {busy ? <LoadingDots /> : (
              <>
                <IconLockCircleOpen size={16} aria-hidden="true" />
                Change password
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  )
}

function FeedbackSection() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const message = ((new FormData(form).get('feedback-message') as string) ?? '').trim()
    if (!message) return

    setBusy(true)
    setError('')
    setSent(false)
    try {
      await submitFeedback(message)
      setSent(true)
      form.reset()
    } catch (err) {
      setError((err as Error).message || 'Failed to send feedback')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Feedback</h2>
          <p className="settings-section-desc">
            Something broken, missing, or annoying? It goes straight to the people building itsasecret.
          </p>
        </div>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="profile-form">
        <div className="input-group">
          <label className="input-label" htmlFor="feedback-message">Message</label>
          <textarea
            name="feedback-message"
            id="feedback-message"
            className="input-field kv-value-field"
            placeholder="What should we know?"
            rows={4}
            maxLength={5000}
            required
          />
        </div>
        {error && <span className="input-error">{error}</span>}
        <div className="settings-modal-actions">
          {sent && <span className="input-helper">Thanks - feedback sent.</span>}
          <Button type="submit" size="md" disabled={busy}>
            {busy ? <LoadingDots /> : (
              <>
                <IconPaperPlane2 size={16} aria-hidden="true" />
                Send feedback
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  )
}
