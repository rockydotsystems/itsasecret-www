import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { feedback } from '~/lib/schema'
import { generateId, auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { sendFeedbackEmail } from '~/lib/email'
import { isRateLimited, recordFailedAttempt } from '~/lib/rate-limit'

const feedbackSchema = z.object({
  message: z.string().trim().min(1, 'Feedback cannot be empty').max(5000, 'Feedback is too long (5000 characters max)'),
})

export const Route = createFileRoute('/api/feedback')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user } = await requireAuth(request)

          // Every submission counts against the window - this is spam
          // protection, not failure tracking.
          const rateKey = `feedback:${user.id}`
          const rateLimit = isRateLimited(rateKey)
          if (rateLimit.limited) {
            return Response.json(
              { error: 'Too much feedback at once. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
            )
          }
          recordFailedAttempt(rateKey)

          const { message } = feedbackSchema.parse(await request.json())

          await db.insert(feedback).values({
            id: generateId(),
            user_id: user.id,
            message,
          })

          // Best-effort forward; the row above is the source of truth.
          try {
            await sendFeedbackEmail({ fromUserEmail: user.email, fromUserName: user.name, message })
          } catch (mailErr) {
            console.error('[email] feedback send threw:', mailErr)
          }

          await auditLog({ actorUserId: user.id, action: 'user.feedback' })

          return Response.json({ ok: true }, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
