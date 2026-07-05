// Integration test for memberEnvRole against the local dev Postgres -
// verifies the team-grant joins actually execute. Skipped when no database
// is reachable (CI has none).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db } from './db'
import { users, orgs, orgMembers, projects, environments, envPermissions, teams, teamMembers, teamEnvPermissions, teamProjectPermissions } from './schema'
import { memberEnvRole } from './rbac'
import { generateId } from './db-utils'

const ids = {
  user: generateId(),
  owner: generateId(),
  org: generateId(),
  project: generateId(),
  env: generateId(),
  teamA: generateId(),
  teamB: generateId(),
}

const dbUp = await db.execute(sql`select 1`).then(() => true, () => false)

describe.runIf(dbUp)('memberEnvRole (db)', () => {

beforeAll(async () => {
  await db.insert(users).values([
    { id: ids.user, email: `rbac-test-${ids.user}@test.invalid`, password_hash: 'x', kdf_salt: 'x', kdf_params: 'x' },
    { id: ids.owner, email: `rbac-test-${ids.owner}@test.invalid`, password_hash: 'x', kdf_salt: 'x', kdf_params: 'x' },
  ])
  await db.insert(orgs).values({ id: ids.org, name: 'rbac-test', owner_user_id: ids.owner })
  await db.insert(orgMembers).values([
    { org_id: ids.org, user_id: ids.owner, role: 'owner', wrapped_org_key: 'x' },
    { org_id: ids.org, user_id: ids.user, role: 'member', wrapped_org_key: 'x' },
  ])
  await db.insert(projects).values({ id: ids.project, org_id: ids.org, name: `rbac-test-${ids.project}` })
  await db.insert(environments).values({ id: ids.env, project_id: ids.project, name: 'production', created_by: ids.owner })
  await db.insert(teams).values([
    { id: ids.teamA, org_id: ids.org, name: `rbac-test-a-${ids.teamA}` },
    { id: ids.teamB, org_id: ids.org, name: `rbac-test-b-${ids.teamB}` },
  ])
})

afterAll(async () => {
  await db.delete(teamEnvPermissions).where(eq(teamEnvPermissions.env_id, ids.env))
  await db.delete(teamProjectPermissions).where(eq(teamProjectPermissions.project_id, ids.project))
  await db.delete(teamMembers).where(eq(teamMembers.team_id, ids.teamA))
  await db.delete(teamMembers).where(eq(teamMembers.team_id, ids.teamB))
  await db.delete(teams).where(eq(teams.org_id, ids.org))
  await db.delete(envPermissions).where(eq(envPermissions.env_id, ids.env))
  await db.delete(environments).where(eq(environments.id, ids.env))
  await db.delete(projects).where(eq(projects.id, ids.project))
  await db.delete(orgMembers).where(eq(orgMembers.org_id, ids.org))
  await db.delete(orgs).where(eq(orgs.id, ids.org))
  await db.delete(users).where(eq(users.id, ids.user))
  await db.delete(users).where(eq(users.id, ids.owner))
})

  it('no grants -> empty', async () => {
    expect(await memberEnvRole(ids.user, ids.env, ids.project)).toBe('')
  })

  it('direct env grant', async () => {
    await db.insert(envPermissions).values({ env_id: ids.env, user_id: ids.user, role: 'read' })
    expect(await memberEnvRole(ids.user, ids.env, ids.project)).toBe('read')
  })

  it('team env grant widens direct read to write', async () => {
    await db.insert(teamMembers).values({ team_id: ids.teamA, user_id: ids.user })
    await db.insert(teamEnvPermissions).values({ env_id: ids.env, team_id: ids.teamA, role: 'write' })
    expect(await memberEnvRole(ids.user, ids.env, ids.project)).toBe('write')
  })

  it('team project grant widens to admin', async () => {
    await db.insert(teamMembers).values({ team_id: ids.teamB, user_id: ids.user })
    await db.insert(teamProjectPermissions).values({ project_id: ids.project, team_id: ids.teamB, role: 'admin' })
    expect(await memberEnvRole(ids.user, ids.env, ids.project)).toBe('admin')
  })

  it('soft-deleting a team kills its grants instantly', async () => {
    await db.update(teams).set({ deleted_at: new Date() }).where(eq(teams.id, ids.teamB))
    expect(await memberEnvRole(ids.user, ids.env, ids.project)).toBe('write')
    await db.update(teams).set({ deleted_at: new Date() }).where(eq(teams.id, ids.teamA))
    expect(await memberEnvRole(ids.user, ids.env, ids.project)).toBe('read')
  })

  it('grants of teams the user is not in do not apply', async () => {
    await db.update(teams).set({ deleted_at: null }).where(eq(teams.id, ids.teamB))
    await db.delete(teamMembers).where(eq(teamMembers.team_id, ids.teamB))
    expect(await memberEnvRole(ids.user, ids.env, ids.project)).toBe('read')
  })
})
