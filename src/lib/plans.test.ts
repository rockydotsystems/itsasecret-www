import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db } from './db'
import { users, orgs, orgMembers, projects } from './schema'
import {
  PLAN_FREE,
  PLAN_TEAM,
  billableSeats,
  planLimits,
  isPaidStatus,
  assertProjectCapacity,
  assertCollaborationAllowed,
  countOrgMembers,
  getOrgPlan,
} from './plans'
import { FREE_MAX_PROJECTS, TEAM_MAX_PROJECTS } from './plans-shared'
import { generateId } from './db-utils'

describe('billableSeats', () => {
  it('grants one free super-user, floor of 1', () => {
    expect(billableSeats(1)).toBe(1)
    expect(billableSeats(2)).toBe(1)
    expect(billableSeats(3)).toBe(2)
    expect(billableSeats(10)).toBe(9)
  })
})

describe('planLimits', () => {
  it('free and team caps match the pricing page', () => {
    expect(planLimits(PLAN_FREE).maxProjects).toBe(FREE_MAX_PROJECTS)
    expect(planLimits(PLAN_TEAM).maxProjects).toBe(TEAM_MAX_PROJECTS)
  })

  it('unknown plan strings fall back to free limits', () => {
    expect(planLimits('garbage').maxProjects).toBe(FREE_MAX_PROJECTS)
  })

  it('collaboration is a Team-only flag', () => {
    expect(planLimits(PLAN_FREE).collaboration).toBe(false)
    expect(planLimits(PLAN_TEAM).collaboration).toBe(true)
    expect(planLimits('garbage').collaboration).toBe(false)
  })
})

describe('isPaidStatus', () => {
  it('keeps Team access through active, trialing, and past_due', () => {
    expect(isPaidStatus('active')).toBe(true)
    expect(isPaidStatus('trialing')).toBe(true)
    expect(isPaidStatus('past_due')).toBe(true)
  })

  it('drops everything else to free', () => {
    for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
      expect(isPaidStatus(s)).toBe(false)
    }
  })
})

// Plan-limit enforcement against the local dev Postgres; skipped with no DB.
const dbUp = await db.execute(sql`select 1`).then(() => true, () => false)

const ids = {
  owner: generateId(),
  freeOrg: generateId(),
  teamOrg: generateId(),
  ghostOrg: generateId(),
}

describe.runIf(dbUp)('assertProjectCapacity (db)', () => {
  beforeAll(async () => {
    await db.insert(users).values({ id: ids.owner, email: `plans-test-${ids.owner}@test.invalid`, password_hash: 'x', kdf_salt: 'x', kdf_params: 'x' })
    await db.insert(orgs).values([
      { id: ids.freeOrg, name: 'plans-test-free', owner_user_id: ids.owner },
      { id: ids.teamOrg, name: 'plans-test-team', owner_user_id: ids.owner, plan: PLAN_TEAM },
      { id: ids.ghostOrg, name: 'plans-test-ghost', owner_user_id: ids.owner },
    ])
    await db.insert(orgMembers).values([
      { org_id: ids.freeOrg, user_id: ids.owner, role: 'owner', wrapped_org_key: 'x' },
    ])
  })

  afterAll(async () => {
    for (const orgId of [ids.freeOrg, ids.teamOrg, ids.ghostOrg]) {
      await db.delete(projects).where(eq(projects.org_id, orgId))
      await db.delete(orgMembers).where(eq(orgMembers.org_id, orgId))
      await db.delete(orgs).where(eq(orgs.id, orgId))
    }
    await db.delete(users).where(eq(users.id, ids.owner))
  })

  it('new orgs default to the free plan', async () => {
    expect(await getOrgPlan(ids.freeOrg)).toBe(PLAN_FREE)
    expect(await getOrgPlan(ids.ghostOrg)).toBe(PLAN_FREE)
  })

  it('counts members', async () => {
    expect(await countOrgMembers(ids.freeOrg)).toBe(1)
  })

  it('free orgs stop at the free cap', async () => {
    // Soft-deleted projects must not count toward the cap: FREE_MAX-1 live
    // rows plus one deleted row is still one short of the limit.
    const rows = Array.from({ length: FREE_MAX_PROJECTS }, (_, i) => ({
      id: generateId(),
      org_id: ids.freeOrg,
      name: `plans-test-p${i}`,
      ...(i === FREE_MAX_PROJECTS - 1 ? { deleted_at: new Date() } : {}),
    }))
    await db.insert(projects).values(rows)

    await expect(assertProjectCapacity(ids.freeOrg)).resolves.toBeUndefined()

    await db.insert(projects).values({ id: generateId(), org_id: ids.freeOrg, name: 'plans-test-overcap' })
    await expect(assertProjectCapacity(ids.freeOrg)).rejects.toMatchObject({ status: 402 })
  })

  it('team orgs get the team cap', async () => {
    const rows = Array.from({ length: FREE_MAX_PROJECTS }, (_, i) => ({
      id: generateId(),
      org_id: ids.teamOrg,
      name: `plans-test-t${i}`,
    }))
    await db.insert(projects).values(rows)
    expect(await getOrgPlan(ids.teamOrg)).toBe(PLAN_TEAM)
    await expect(assertProjectCapacity(ids.teamOrg)).resolves.toBeUndefined()
  })

  it('collaboration gate 402s free orgs, allows team orgs', async () => {
    await expect(assertCollaborationAllowed(ids.freeOrg)).rejects.toMatchObject({ status: 402 })
    await expect(assertCollaborationAllowed(ids.ghostOrg)).rejects.toMatchObject({ status: 402 })
    await expect(assertCollaborationAllowed(ids.teamOrg)).resolves.toBeUndefined()
  })
})
