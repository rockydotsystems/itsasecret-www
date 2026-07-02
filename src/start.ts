import { createStart, createCsrfMiddleware } from '@tanstack/react-start'
import { lte } from 'drizzle-orm'
import { db } from './lib/db'
import { envVars, secrets, environments, projects } from './lib/schema'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}))

const PURGE_INTERVAL = 24 * 60 * 60 * 1000
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

async function purgeExpired(): Promise<void> {
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS)

  await db.delete(envVars).where(lte(envVars.deleted_at, cutoff))
  await db.delete(secrets).where(lte(secrets.deleted_at, cutoff))
  await db.delete(environments).where(lte(environments.deleted_at, cutoff))
  await db.delete(projects).where(lte(projects.deleted_at, cutoff))
}

let purgeTimer: ReturnType<typeof setInterval> | null = null

export function startPurgeCron(): void {
  if (purgeTimer) return
  purgeTimer = setInterval(() => {
    purgeExpired().catch((err) => console.error('Purge failed:', err))
  }, PURGE_INTERVAL)
}

startPurgeCron()
