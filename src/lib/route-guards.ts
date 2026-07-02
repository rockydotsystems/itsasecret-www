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
