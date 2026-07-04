import { createFileRoute } from '@tanstack/react-router'
import { LogoMark } from '~/components/logo'
import { WorkspaceWizard } from '~/components/workspacewizard'
import { requireOnboardingBeforeLoad } from '~/lib/route-guards'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: requireOnboardingBeforeLoad,
  loader: ({ context }) => ({ email: context.user.email }),
  component: OnboardingPage,
})

function OnboardingPage() {
  const { email } = Route.useLoaderData()

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <LogoMark size={28} />
          <span style={{ font: '600 var(--text-xl)/var(--leading-snug) var(--font-family-display)', color: 'var(--text-primary)' }}>
            itsasecret
          </span>
        </div>
        <WorkspaceWizard
          mode="onboarding"
          defaultOrgName={`${email.split('@')[0]}'s org`}
          onComplete={({ orgId, projectId }) => {
            window.location.href = `/dashboard/${orgId}/${projectId}`
          }}
        />
      </div>
    </div>
  )
}
