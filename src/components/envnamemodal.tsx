import { useState } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LoadingDots } from '~/components/loadingdots'
import { Modal } from '~/components/modal'
import type { ReactNode } from 'react'

export type EnvNameModalProps = {
  title: string
  subtitle: string
  submitLabel: string
  placeholder: string
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
  icon?: ReactNode
}

export function EnvNameModal({ title, subtitle, submitLabel, placeholder, onClose, onSubmit, icon }: EnvNameModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const name = (e.currentTarget.elements.namedItem('name') as HTMLInputElement).value.trim()
    try {
      if (!name) throw new Error('Name cannot be empty')
      await onSubmit(name)
    } catch (err) {
      setError((err as Error).message || 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Input name="name" label="Environment name" placeholder={placeholder} mono required />
        {error && <span className="input-error">{error}</span>}
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? <LoadingDots /> : (
            <>
              {icon}
              {submitLabel}
            </>
          )}
        </Button>
      </form>
    </Modal>
  )
}
