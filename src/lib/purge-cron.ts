import { lte, and, or, ne, lt, inArray } from 'drizzle-orm'
import { db } from './db'
import { envVars, secrets, environments, projects, secretHistory, envVarHistory, orgInvites, envPermissions, teamEnvPermissions, teamProjectPermissions, userLastEnv, userLastProject, sessions } from './schema'
import { TOKEN_NEVER_EXPIRES } from './sessions'

const PURGE_INTERVAL = 24 * 60 * 60 * 1000
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// One failing step must not abort the unrelated ones.
async function purgeStep(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`Purge step failed (${name}):`, err)
  }
}

async function purgeExpired(): Promise<void> {
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS)
  const historyCutoff = new Date(Date.now() - SEVEN_DAYS_MS)

  // Expired/revoked sessions after 7 days - except never-expiring token rows,
  // which keep their revocation trail on the tokens page.
  const sessionCutoff = new Date(Date.now() - SEVEN_DAYS_MS)
  await purgeStep('sessions', () => db.delete(sessions).where(and(
    or(lte(sessions.expires_at, sessionCutoff), lte(sessions.revoked_at, sessionCutoff)),
    or(ne(sessions.kind, 'token'), lt(sessions.expires_at, TOKEN_NEVER_EXPIRES))
  )))

  // History first: rows reference secrets/env_vars and there is no CASCADE.
  await purgeStep('secret-history', () => db.delete(secretHistory).where(lte(secretHistory.created_at, historyCutoff)))
  await purgeStep('env-var-history', () => db.delete(envVarHistory).where(lte(envVarHistory.created_at, historyCutoff)))

  // Child grant rows before environments/projects: there is no CASCADE, so
  // leftover children would abort the deletes and the purge would never
  // complete. Environments of purged projects are included so a project with
  // lingering env rows still goes out cleanly.
  const purgedProjectIds = db.select({ id: projects.id }).from(projects).where(lte(projects.deleted_at, cutoff))
  const purgedEnvIds = db.select({ id: environments.id }).from(environments)
    .where(or(lte(environments.deleted_at, cutoff), inArray(environments.project_id, purgedProjectIds)))
  await purgeStep('env-permissions', () => db.delete(envPermissions).where(inArray(envPermissions.env_id, purgedEnvIds)))
  await purgeStep('team-env-permissions', () => db.delete(teamEnvPermissions).where(inArray(teamEnvPermissions.env_id, purgedEnvIds)))
  await purgeStep('user-last-env', () => db.delete(userLastEnv).where(inArray(userLastEnv.env_id, purgedEnvIds)))
  await purgeStep('team-project-permissions', () => db.delete(teamProjectPermissions).where(inArray(teamProjectPermissions.project_id, purgedProjectIds)))
  await purgeStep('user-last-project', () => db.delete(userLastProject).where(inArray(userLastProject.project_id, purgedProjectIds)))

  await purgeStep('env-vars', () => db.delete(envVars).where(lte(envVars.deleted_at, cutoff)))
  await purgeStep('secrets', () => db.delete(secrets).where(lte(secrets.deleted_at, cutoff)))
  await purgeStep('environments', () => db.delete(environments).where(lte(environments.deleted_at, cutoff)))
  await purgeStep('projects', () => db.delete(projects).where(lte(projects.deleted_at, cutoff)))

  // Org invites: every row eventually passes expires_at (accepted and revoked
  // ones included), so one cutoff clears them all - and drops the stored
  // server-wrapped org key with it.
  await purgeStep('org-invites', () => db.delete(orgInvites).where(lte(orgInvites.expires_at, cutoff)))
}

let purgeTimer: ReturnType<typeof setInterval> | null = null

export function startPurgeCron(): void {
  if (purgeTimer) return
  purgeTimer = setInterval(() => {
    purgeExpired().catch((err) => console.error('Purge failed:', err))
  }, PURGE_INTERVAL)
  purgeTimer.unref()
}
