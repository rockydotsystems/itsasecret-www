import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { db } from './db'
import * as schema from './schema'

export function generateId(): string {
  return createId()
}

// Every project starts with one environment - 'production' by default
// (product spec); onboarding lets the user name their first one.
export async function createProjectWithEnv(
  orgId: string,
  name: string,
  createdBy: string,
  envName = 'production'
): Promise<string> {
  const projectId = generateId()
  await db.insert(schema.projects).values({
    id: projectId,
    org_id: orgId,
    name,
  })
  await db.insert(schema.environments).values({
    id: generateId(),
    project_id: projectId,
    name: envName,
    created_by: createdBy,
  })
  return projectId
}

export async function softDeleteOrg(id: string): Promise<void> {
  await db.update(schema.orgs).set({ deleted_at: new Date() }).where(eq(schema.orgs.id, id))
}

export async function softDeleteProject(id: string): Promise<void> {
  await db.update(schema.projects).set({ deleted_at: new Date() }).where(eq(schema.projects.id, id))
}

export async function softDeleteEnvironment(id: string): Promise<void> {
  await db.update(schema.environments).set({ deleted_at: new Date() }).where(eq(schema.environments.id, id))
}

export async function softDeleteEnvVar(id: string): Promise<void> {
  await db.update(schema.envVars).set({ deleted_at: new Date() }).where(eq(schema.envVars.id, id))
}

export async function softDeleteSecret(id: string): Promise<void> {
  await db.update(schema.secrets).set({ deleted_at: new Date() }).where(eq(schema.secrets.id, id))
}

export async function auditLog(entry: {
  orgId?: string
  actorUserId: string
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await db.insert(schema.auditLog).values({
    id: generateId(),
    org_id: entry.orgId ?? null,
    actor_user_id: entry.actorUserId,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
  })
}
