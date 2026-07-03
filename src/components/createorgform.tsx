import { useState } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LoadingDots } from '~/components/loadingdots'
import { createOrganization } from '~/lib/org-form'
import type { Org } from '~/lib/schema'

export type CreateOrgFormProps = {
  onCreated: (org: Org) => void
}

export function CreateOrgForm({ onCreated }: CreateOrgFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const name = (form.elements.namedItem('name') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    try {
      const { org } = await createOrganization(name, password)
      onCreated(org)
    } catch (err) {
      setError('Error: ' + ((err as Error).message || 'unknown'))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Input
        name="name"
        type="text"
        label="Organization name"
        placeholder="e.g. Acme Engineering"
        required
      />
      <Input
        name="password"
        type="password"
        label="Master password"
        placeholder="Your master password"
        helperText="We need your master password to encrypt the new organization's key."
        required
      />
      <span className="input-error">{error}</span>
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? <LoadingDots /> : 'Create organization'}
      </Button>
    </form>
  )
}
