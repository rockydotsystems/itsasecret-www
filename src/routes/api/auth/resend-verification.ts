import { createFileRoute } from '@tanstack/react-router'
import { requireAuth, errorResponse } from '~/lib/auth'
import { createEmailVerification, verificationUrl } from '~/lib/email-verification'
import { sendVerificationEmail } from '~/lib/email'
import { getClientIP, isRateLimited } from '~/lib/rate-limit'

export const Route = createFileRoute('/api/auth/resend-verification')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Reachable while unverified - that's the whole point.
          const { user } = await requireAuth(request, { allowUnverified: true })

          // Already verified: nothing to do (also stops link spam).
          if (user.email_verified_at !== null) {
            return Response.json({ ok: true, alreadyVerified: true }, { status: 200 })
          }

          const rateLimit = isRateLimited(`resend-verification:${getClientIP(request)}`)
          if (rateLimit.limited) {
            return Response.json(
              { error: 'Too many requests. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
            )
          }

          const { token } = await createEmailVerification(user.id)
          await sendVerificationEmail({ to: user.email, verifyUrl: verificationUrl(request, token) })

          return Response.json({ ok: true }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
