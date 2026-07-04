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
