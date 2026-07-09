import { createFileRoute } from '@tanstack/react-router'
import { requireAuth, errorResponse } from '~/lib/auth'
import { createEmailVerification, verificationUrl } from '~/lib/email-verification'
import { sendVerificationEmail } from '~/lib/email'
import { isRateLimited, recordFailedAttempt } from '~/lib/rate-limit'

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

          // Key on the account, not the (spoofable, shared-NAT) client IP: this
          // caps verification emails sent to a given user's inbox. Each send
          // counts against the window - without recording, the check never trips.
          const rateKey = `resend-verification:${user.id}`
          const rateLimit = isRateLimited(rateKey)
          if (rateLimit.limited) {
            return Response.json(
              { error: 'Too many requests. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
            )
          }
          recordFailedAttempt(rateKey)

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
