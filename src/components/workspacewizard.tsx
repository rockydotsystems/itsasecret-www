import { useState, useEffect } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LoadingDots } from '~/components/loadingdots'
import { completeOnboarding, createOrgWorkspace } from '~/lib/org-form'
import { isVaultUnlocked } from '~/lib/vault'
import { IconCheck, IconChevronRight, IconRocket } from 'nucleo-pixel-essential'

// Guided org → project → environment setup, shared by the post-verification
// onboarding page (with intro step, personal org) and the dashboard's
// "+ New org" modal (no intro, shared org).
export type WorkspaceWizardProps = {
  mode: 'onboarding' | 'org'
  defaultOrgName?: string
  onComplete: (result: { orgId: string; projectId: string }) => void
}

function inputValue(form: HTMLFormElement, name: string): string {
  return (form.elements.namedItem(name) as HTMLInputElement).value
}

export function WorkspaceWizard({ mode, defaultOrgName = '', onComplete }: WorkspaceWizardProps) {
  const intro = mode === 'onboarding'
  const stepCount = intro ? 4 : 3
  const firstStep = intro ? 0 : 1

  const [step, setStep] = useState(firstStep)
  const [orgName, setOrgName] = useState(defaultOrgName)
  const [projectName, setProjectName] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // The vault is normally seeded in the tab the user logged in from; a fresh
  // tab needs the master password to wrap the new org key.
  useEffect(() => {
    isVaultUnlocked()
      .then((unlocked) => setNeedsPassword(!unlocked))
      .catch(() => setNeedsPassword(true))
  }, [])

  const titleClass = intro ? 'auth-title' : 'wizard-title'
  const subtitleClass = intro ? 'auth-subtitle' : 'wizard-subtitle'

  function back() {
    setError('')
    setStep((s) => Math.max(s - 1, firstStep))
  }

  function welcomeNext(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStep(1)
  }

  function orgNext(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setOrgName(inputValue(e.currentTarget, 'orgName').trim())
    setError('')
    setStep(2)
  }

  function projectNext(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setProjectName(inputValue(e.currentTarget, 'projectName').trim())
    setError('')
    setStep(3)
  }

  async function finish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const input = {
      orgName,
      projectName,
      envName: inputValue(form, 'envName').trim(),
      password: needsPassword ? inputValue(form, 'password') : undefined,
    }

    setLoading(true)
    setError('')
    try {
      const result = mode === 'onboarding' ? await completeOnboarding(input) : await createOrgWorkspace(input)
      onComplete(result)
    } catch (err) {
      setError('Error: ' + ((err as Error).message || 'unknown'))
      setLoading(false)
    }
  }

  return (
    <>
      <div className="onboarding-steps">
        {Array.from({ length: stepCount }, (_, i) => {
          const active = i + firstStep <= step
          return <span key={i} className={active ? 'onboarding-dot onboarding-dot-active' : 'onboarding-dot'} />
        })}
        <span className="onboarding-step-label">
          Step {step - firstStep + 1} of {stepCount}
        </span>
      </div>

      {step === 0 && (
        <form onSubmit={welcomeNext} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h1 className={titleClass}>Welcome aboard</h1>
            <p className={subtitleClass}>
              Your email is verified. Let's set up your workspace: an organization that holds
              your projects, and an environment for your first project's vars and secrets.
            </p>
          </div>
          <Button type="submit" size="lg">
            Get started
            <IconRocket size={16} aria-hidden="true" />
          </Button>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={orgNext} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h1 className={titleClass}>Name your organization</h1>
            <p className={subtitleClass}>
              {mode === 'onboarding'
                ? 'This is your personal org - just you. You can create shared orgs for your team later.'
                : 'Shared orgs let you invite teammates and collaborate on projects.'}
            </p>
          </div>
          <Input
            name="orgName"
            type="text"
            label="Organization name"
            placeholder={mode === 'org' ? 'e.g. Acme Engineering' : undefined}
            value={orgName}
            required
          />
          <div className="onboarding-actions">
            {intro && <Button type="button" variant="secondary" onClick={back}>Back</Button>}
            <Button type="submit">
              Continue
              <IconChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={projectNext} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h1 className={titleClass}>Create {mode === 'onboarding' ? 'your' : 'its'} first project</h1>
            <p className={subtitleClass}>
              A project usually maps to one app or repo - its environments hold the config.
            </p>
          </div>
          <Input
            name="projectName"
            type="text"
            label="Project name"
            placeholder="e.g. my-app"
            value={projectName}
            required
          />
          <div className="onboarding-actions">
            <Button type="button" variant="secondary" onClick={back}>Back</Button>
            <Button type="submit">
              Continue
              <IconChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={finish} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h1 className={titleClass}>Name {mode === 'onboarding' ? 'your' : 'its'} first environment</h1>
            <p className={subtitleClass}>
              Environments hold your vars and secrets - production, staging, dev forks. Start
              with one; fork more later.
            </p>
          </div>
          <Input name="envName" type="text" label="Environment name" value="production" required />
          {needsPassword && (
            <Input
              name="password"
              type="password"
              label="Master password"
              placeholder="Your master password"
              helperText="We need your master password to encrypt your organization's key."
              required
            />
          )}
          <span className="input-error">{error}</span>
          <div className="onboarding-actions">
            <Button type="button" variant="secondary" onClick={back} disabled={loading}>Back</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <LoadingDots /> : (
                <>
                  <IconCheck size={16} aria-hidden="true" />
                  {mode === 'onboarding' ? 'Create workspace' : 'Create organization'}
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </>
  )
}
