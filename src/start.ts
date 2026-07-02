import { createStart, createCsrfMiddleware } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}))

// The purge cron touches Postgres, so it must only run on the server.
// start.ts is loaded by the client, so use a dynamic import guarded by the
// environment to avoid pulling postgres (Node-only) into the browser bundle.
if (typeof window === 'undefined') {
  void import('./lib/purge-cron').then((m) => m.startPurgeCron())
}
