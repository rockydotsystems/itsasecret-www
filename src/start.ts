import { createStart, createCsrfMiddleware } from '@tanstack/react-start'
import { db } from './lib/db'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}))

const PURGE_INTERVAL = 24 * 60 * 60 * 1000
const cutoff = 90 * 24 * 60 * 60

async function purgeExpired(): Promise<void> {
  const tables = ['env_vars', 'secrets', 'environments', 'projects']
  for (const table of tables) {
    await db.prepare(
      `DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-${cutoff} seconds')`
    ).run()
  }
}

let purgeTimer: ReturnType<typeof setInterval> | null = null

export function startPurgeCron(): void {
  if (purgeTimer) return
  purgeTimer = setInterval(() => {
    purgeExpired().catch((err) => console.error('Purge failed:', err))
  }, PURGE_INTERVAL)
}

startPurgeCron()
