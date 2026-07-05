import { createStart, createCsrfMiddleware, createMiddleware } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

// Rolling CLI sessions: successful authenticated /api responses carry a fresh
// session token (X-New-Session-Token). Server-only work is behind a dynamic
// import so postgres never reaches the client bundle (same trick as the
// purge cron below).
const sessionRotationMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ request, pathname, next }) => {
    const result = await next()
    if (typeof window === 'undefined' && pathname.startsWith('/api/')) {
      try {
        const { maybeRotateCliSession } = await import('./lib/session-rotation')
        await maybeRotateCliSession(request, result.response)
      } catch {
        // Rotation is best-effort — never break the actual response over it.
      }
    }
    return result
  }
)

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, sessionRotationMiddleware],
}))

// The purge cron touches Postgres, so it must only run on the server.
// start.ts is loaded by the client, so use a dynamic import guarded by the
// environment to avoid pulling postgres (Node-only) into the browser bundle.
if (typeof window === 'undefined') {
  void import('./lib/purge-cron').then((m) => m.startPurgeCron())
}
