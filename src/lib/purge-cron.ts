import { lte } from 'drizzle-orm'
import { db } from './db'
import { envVars, secrets, environments, projects, secretHistory, envVarHistory, orgInvites } from './schema'

const PURGE_INTERVAL = 24 * 60 * 60 * 1000
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

async function purgeExpired(): Promise<void> {
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS)
  const historyCutoff = new Date(Date.now() - SEVEN_DAYS_MS)

  // History first: rows reference secrets/env_vars and there is no CASCADE.
  await db.delete(secretHistory).where(lte(secretHistory.created_at, historyCutoff))
  await db.delete(envVarHistory).where(lte(envVarHistory.created_at, historyCutoff))

  await db.delete(envVars).where(lte(envVars.deleted_at, cutoff))
  await db.delete(secrets).where(lte(secrets.deleted_at, cutoff))
  await db.delete(environments).where(lte(environments.deleted_at, cutoff))
  await db.delete(projects).where(lte(projects.deleted_at, cutoff))

  // Org invites: every row eventually passes expires_at (accepted and revoked
  // ones included), so one cutoff clears them all - and drops the stored
  // server-wrapped org key with it.
  await db.delete(orgInvites).where(lte(orgInvites.expires_at, cutoff))
}

let purgeTimer: ReturnType<typeof setInterval> | null = null

export function startPurgeCron(): void {
  if (purgeTimer) return
  purgeTimer = setInterval(() => {
    purgeExpired().catch((err) => console.error('Purge failed:', err))
  }, PURGE_INTERVAL)
  purgeTimer.unref()
}
