import { db } from './db'

export function generateId(): string {
  return crypto.randomUUID()
}

export async function softDelete(table: string, id: string): Promise<void> {
  await db.prepare(
    `UPDATE ${table} SET deleted_at = datetime('now') WHERE id = ?`
  ).bind(id).run()
}

export async function auditLog(entry: {
  orgId?: string;
  actorUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.prepare(
    'INSERT INTO audit_log (id, org_id, actor_user_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    generateId(),
    entry.orgId ?? null,
    entry.actorUserId,
    entry.action,
    entry.targetType ?? null,
    entry.targetId ?? null,
    entry.metadata ? JSON.stringify(entry.metadata) : null
  ).run()
}
