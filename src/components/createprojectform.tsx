import { useState } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LoadingDots } from '~/components/loadingdots'
import { createProject } from '~/lib/project-form'
import { IconFolderOpen } from 'nucleo-pixel-essential'
import type { Org, Project } from '~/lib/schema'

export type CreateProjectFormProps = {
  org: Org
  onCreated: (project: Project) => void
}

export function CreateProjectForm({ org, onCreated }: CreateProjectFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const name = (form.elements.namedItem('name') as HTMLInputElement).value

    try {
      const project = await createProject(org.id, name)
      onCreated(project)
    } catch (err) {
      setError('Error: ' + ((err as Error).message || 'unknown'))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Input label="Organization" value={org.name} disabled />
      <Input
        name="name"
        type="text"
        label="Project name"
        placeholder="e.g. acme-api"
        required
      />
      <span className="input-error">{error}</span>
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? <LoadingDots /> : (
          <>
            <IconFolderOpen size={16} aria-hidden="true" />
            Create project
          </>
        )}
      </Button>
    </form>
  )
}
