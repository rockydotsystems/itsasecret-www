import { useState } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LoadingDots } from '~/components/loadingdots'
import { Modal } from '~/components/modal'

export type KeyValueModalProps = {
  title: string
  subtitle: string
  submitLabel: string
  keyPlaceholder: string
  valuePlaceholder: string
  onClose: () => void
  onSubmit: (key: string, value: string) => Promise<void>
}

export function KeyValueModal({
  title,
  subtitle,
  submitLabel,
  keyPlaceholder,
  valuePlaceholder,
  onClose,
  onSubmit,
}: KeyValueModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const form = e.currentTarget
    const key = (form.elements.namedItem('key') as HTMLInputElement).value.trim()
    const value = (form.elements.namedItem('value') as HTMLTextAreaElement).value
    try {
      if (!key) throw new Error('Key cannot be empty')
      await onSubmit(key, value)
    } catch (err) {
      setError((err as Error).message || 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Input name="key" label="Key" placeholder={keyPlaceholder} mono required />
        <div className="input-group">
          <label className="input-label" htmlFor="value">Value</label>
          <textarea
            name="value"
            id="value"
            className="input-field input-mono kv-value-field"
            placeholder={valuePlaceholder}
            rows={3}
          />
        </div>
        {error && <span className="input-error">{error}</span>}
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? <LoadingDots /> : submitLabel}
        </Button>
      </form>
    </Modal>
  )
}
