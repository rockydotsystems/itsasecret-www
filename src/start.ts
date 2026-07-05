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

// Boot-time DB work touches Postgres, so it must only run on the server.
// start.ts is loaded by the client, so use dynamic imports guarded by the
// environment to avoid pulling postgres (Node-only) into the browser bundle.
if (typeof window === 'undefined') {
  const bootstrap = async () => {
    // MIGRATE_ON_BOOT is set on the Railway web service; local dev keeps
    // using db:push / db:migrate explicitly.
    if (process.env.MIGRATE_ON_BOOT) {
      const { migrateOnBoot } = await import('./lib/migrate-on-boot')
      await migrateOnBoot()
    }
    const { startPurgeCron } = await import('./lib/purge-cron')
    startPurgeCron()
  }
  void bootstrap().catch((err) => {
    // A failed migration must fail the deploy, not serve on a stale schema.
    console.error('Boot-time migration failed:', err)
    process.exit(1)
  })
}
