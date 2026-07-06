import { useState } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LoadingDots } from '~/components/loadingdots'
import { Modal } from '~/components/modal'
import { unlockVault } from '~/lib/vault'
import { IconLockCircleOpen } from 'nucleo-pixel-essential'

export type MasterPassModalProps = {
  orgId: string
  onUnlocked: () => void
  onClose: () => void
}

// One-time master password prompt for the web session. The password never
// leaves the browser: it derives the master key locally, which unwraps the
// org key for client-side decryption.
export function MasterPassModal({ orgId, onUnlocked, onClose }: MasterPassModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const password = (e.currentTarget.elements.namedItem('masterPassword') as HTMLInputElement).value
    try {
      if (!password) throw new Error('Enter your master password')
      await unlockVault(password, orgId)
      onUnlocked()
    } catch (err) {
      setError((err as Error).message || 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Unlock your vault"
      subtitle="Secrets are decrypted in your browser only. Your master password stays on this device - it is never sent to the server."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Input
          name="masterPassword"
          label="Master password"
          type="password"
          placeholder="Your master password"
          required
        />
        {error && <span className="input-error">{error}</span>}
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? <LoadingDots /> : (
            <>
              <IconLockCircleOpen size={16} aria-hidden="true" />
              Unlock
            </>
          )}
        </Button>
      </form>
    </Modal>
  )
}
