import { redirect } from '@tanstack/react-router'
import { getCurrentUserFn } from '~/lib/auth-server'

export async function requireAuthBeforeLoad({ location }: { location: { href: string } }) {
  let user: Awaited<ReturnType<typeof getCurrentUserFn>> | null = null
  try {
    user = await getCurrentUserFn()
  } catch {
    // Treat auth-check failures as unauthenticated and redirect to login
  }
  if (!user) {
    throw redirect({
      to: '/login',
      search: { redirect: location.href },
    })
  }
  // Locked down: unverified accounts can't reach any protected page.
  if (!user.email_verified) {
    throw redirect({ to: '/verify-email' })
  }
  // Verified but no org yet: the onboarding wizard creates the personal org,
  // first project, and first environment before the app is usable.
  if (!user.has_orgs) {
    throw redirect({ to: '/onboarding' })
  }
  return { user }
}

// Guard for the /onboarding wizard: logged-in, verified, zero orgs. Users who
// already have an org (including via a shared-org membership) skip onboarding.
export async function requireOnboardingBeforeLoad() {
  let user: Awaited<ReturnType<typeof getCurrentUserFn>> | null = null
  try {
    user = await getCurrentUserFn()
  } catch {
    // Treat auth-check failures as unauthenticated
  }
  if (!user) {
    throw redirect({ to: '/login', search: {} })
  }
  if (!user.email_verified) {
    throw redirect({ to: '/verify-email' })
  }
  if (user.has_orgs) {
    throw redirect({ to: '/dashboard' })
  }
  return { user }
}

// Guard for the /verify-email holding page: only reachable while logged in and
// unverified. Verified users go to the app; logged-out users go to login.
export async function requireUnverifiedBeforeLoad() {
  let user: Awaited<ReturnType<typeof getCurrentUserFn>> | null = null
  try {
    user = await getCurrentUserFn()
  } catch {
    // Treat auth-check failures as unauthenticated
  }
  if (!user) {
    throw redirect({ to: '/login', search: {} })
  }
  if (user.email_verified) {
    throw redirect({ to: '/dashboard' })
  }
  return { user }
}

export async function requireGuestBeforeLoad() {
  let user: Awaited<ReturnType<typeof getCurrentUserFn>> | null = null
  try {
    user = await getCurrentUserFn()
  } catch {
    // Treat auth-check failures as unauthenticated; allow access to guest pages
  }
  if (user) {
    throw redirect({ to: '/dashboard' })
  }
}
