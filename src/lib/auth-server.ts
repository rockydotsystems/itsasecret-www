import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { getCurrentUserFromRequest } from '~/lib/auth'
import type { CurrentUser } from '~/lib/auth-form'

export const getCurrentUserFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<CurrentUser | null> => {
    const token = getCookie('session_token')
    if (!token) return null

    const request = new Request('http://localhost', {
      headers: { Authorization: `Bearer ${token}` },
    })

    const user = await getCurrentUserFromRequest(request)
    if (!user) return null

    return { id: user.id, email: user.email }
  })
