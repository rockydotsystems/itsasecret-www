import { createStart, createCsrfMiddleware, createMiddleware } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

const apiCsrfMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ request, pathname, next }) => {
    if (pathname.startsWith('/api/')) {
      const method = request.method.toUpperCase()
      if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
        const hasBearer = request.headers.get('authorization')?.startsWith('Bearer ')
        if (!hasBearer && !request.headers.get('x-requested-with')) {
          return new Response(JSON.stringify({ error: 'Missing CSRF header' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
    }
    return next()
  }
)

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
        // Rotation is best-effort - never break the actual response over it.
      }
    }
    return result
  }
)

// Baseline security headers on every response. Deliberately conservative: no
// script-src CSP, because TanStack Start emits inline hydration/router scripts
// that 'self'-only would break - so this covers clickjacking, MIME sniffing,
// referrer leakage, and HSTS rather than XSS. (XSS is high-impact here because
// the bearer token and vault live in the browser; a script-src CSP is worth
// adding separately once the inline scripts carry nonces.)
const securityHeadersMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ request, pathname, next }) => {
    const result = await next()
    const h = result.response.headers
    h.set('X-Content-Type-Options', 'nosniff')
    h.set('X-Frame-Options', 'DENY')
    h.set('Content-Security-Policy', "frame-ancestors 'none'")
    h.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    if (pathname.startsWith('/api/')) {
      h.set('Cache-Control', 'no-store')
    }
    // Only assert HSTS on a request that actually arrived over TLS, so local
    // http dev isn't pinned to https.
    const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '')
    if (proto === 'https') {
      h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    return result
  }
)

export const startInstance = createStart(() => ({
  requestMiddleware: [apiCsrfMiddleware, csrfMiddleware, securityHeadersMiddleware, sessionRotationMiddleware],
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
