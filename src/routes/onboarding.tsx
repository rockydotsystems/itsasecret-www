import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Button } from '~/components/button'
import { Input } from '~/components/input'
import { LogoMark } from '~/components/logo'
import { LoadingDots } from '~/components/loadingdots'
import { requireOnboardingBeforeLoad } from '~/lib/route-guards'
import { completeOnboarding } from '~/lib/org-form'
import { isVaultUnlocked } from '~/lib/vault'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: requireOnboardingBeforeLoad,
  loader: ({ context }) => ({ email: context.user.email }),
  component: OnboardingPage,
})

const STEP_COUNT = 4

function StepDots({ step }: { step: number }) {
  return (
    <div className="onboarding-steps">
      {Array.from({ length: STEP_COUNT }, (_, i) => (
        <span key={i} className={i <= step ? 'onboarding-dot onboarding-dot-active' : 'onboarding-dot'} />
      ))}
      <span className="onboarding-step-label">
        Step {step + 1} of {STEP_COUNT}
      </span>
    </div>
  )
}

function inputValue(form: HTMLFormElement, name: string): string {
  return (form.elements.namedItem(name) as HTMLInputElement).value
}

function OnboardingPage() {
  const { email } = Route.useLoaderData()
  const [step, setStep] = useState(0)
  const [orgName, setOrgName] = useState(`${email.split('@')[0]}'s org`)
  const [projectName, setProjectName] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // The vault is normally seeded in the tab the user just logged in from; a
  // fresh tab needs the master password to wrap the new org key.
  useEffect(() => {
    isVaultUnlocked()
      .then((unlocked) => setNeedsPassword(!unlocked))
      .catch(() => setNeedsPassword(true))
  }, [])

  function back() {
    setError('')
    setStep((s) => Math.max(s - 1, 0))
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
    const envName = inputValue(form, 'envName').trim()
    const password = needsPassword ? inputValue(form, 'password') : undefined

    setLoading(true)
    setError('')
    try {
      const { orgId, projectId } = await completeOnboarding({
        orgName,
        projectName,
        envName,
        password,
      })
      window.location.href = `/dashboard/${orgId}/${projectId}`
    } catch (err) {
      setError('Error: ' + ((err as Error).message || 'unknown'))
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <LogoMark size={28} />
          <span style={{ font: '600 var(--text-xl)/var(--leading-snug) var(--font-family-display)', color: 'var(--text-primary)' }}>
            itsasecret
          </span>
        </div>
        <StepDots step={step} />

        {step === 0 && (
          <form onSubmit={welcomeNext} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 className="auth-title">Welcome aboard</h1>
              <p className="auth-subtitle">
                Your email is verified. Let's set up your workspace: an organization that holds
                your projects, and an environment for your first project's vars and secrets.
              </p>
            </div>
            <Button type="submit" size="lg">Get started</Button>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={orgNext} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 className="auth-title">Name your organization</h1>
              <p className="auth-subtitle">
                This is your personal org — just you. You can create shared orgs for your team later.
              </p>
            </div>
            <Input name="orgName" type="text" label="Organization name" value={orgName} required />
            <div className="onboarding-actions">
              <Button type="button" variant="secondary" onClick={back}>Back</Button>
              <Button type="submit">Continue</Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={projectNext} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 className="auth-title">Create your first project</h1>
              <p className="auth-subtitle">
                A project usually maps to one app or repo — its environments hold the config.
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
              <Button type="submit">Continue</Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={finish} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 className="auth-title">Name your first environment</h1>
              <p className="auth-subtitle">
                Environments hold your vars and secrets — production, staging, dev forks. Start
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
                {loading ? <LoadingDots /> : 'Create workspace'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
