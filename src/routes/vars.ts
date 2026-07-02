import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authMiddleware } from '../auth/middleware';
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '../rbac/middleware';
import { generateId, auditLog, softDelete } from '../db/utils';
import type { EnvVarRow } from '../types';

const app = new OpenAPIHono();

const errorSchema = z.object({ error: z.string() });

const varItemSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const listVarsRoute = createRoute({
  method: 'get',
  path: '/envs/{envId}/vars',
  middleware: [authMiddleware, requireEnvRole([ROLE_READ, ROLE_WRITE, ROLE_ADMIN])],
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(varItemSchema) } },
      description: 'List env vars',
    },
  },
});

const upsertVarRoute = createRoute({
  method: 'put',
  path: '/envs/{envId}/vars/{key}',
  middleware: [authMiddleware, requireEnvRole([ROLE_WRITE, ROLE_ADMIN])],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ value: z.string() }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: varItemSchema } },
      description: 'Var upserted',
    },
  },
});

const deleteVarRoute = createRoute({
  method: 'delete',
  path: '/envs/{envId}/vars/{key}',
  middleware: [authMiddleware, requireEnvRole([ROLE_WRITE, ROLE_ADMIN])],
  responses: {
    204: { description: 'Var deleted' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

app.openapi(listVarsRoute, async (c) => {
  const envId = c.req.param('envId');
  const db = c.get('db');
  const result = await db.prepare(
    'SELECT key, value FROM env_vars WHERE env_id = ? AND deleted_at IS NULL'
  ).bind(envId).all<{ key: string; value: string }>();
  return c.json(result.results, 200);
});

app.openapi(upsertVarRoute, async (c) => {
  const envId = c.req.param('envId');
  const key = c.req.param('key');
  const { value } = c.req.valid('json');
  const user = c.get('user');
  const orgId = c.get('orgId');
  const db = c.get('db');

  const existing = await db.prepare(
    'SELECT * FROM env_vars WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
  ).bind(envId, key).first<EnvVarRow>();

  if (existing) {
    await db.prepare(
      `UPDATE env_vars SET value = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(value, existing.id).run();
  } else {
    const deleted = await db.prepare(
      'SELECT id FROM env_vars WHERE env_id = ? AND key = ? AND deleted_at IS NOT NULL'
    ).bind(envId, key).first<EnvVarRow>();

    if (deleted) {
      await db.prepare(
        `UPDATE env_vars SET value = ?, deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`
      ).bind(value, deleted.id).run();
    } else {
      const varId = generateId();
      await db.prepare(
        'INSERT INTO env_vars (id, env_id, key, value, created_by) VALUES (?, ?, ?, ?, ?)'
      ).bind(varId, envId, key, value, user.id).run();
    }
  }

  await auditLog(db, { orgId, actorUserId: user.id, action: 'var.upsert', targetType: 'env_var', targetId: key, metadata: { envId } });

  return c.json({ key, value }, 200);
});

app.openapi(deleteVarRoute, async (c) => {
  const envId = c.req.param('envId');
  const key = c.req.param('key');
  const user = c.get('user');
  const orgId = c.get('orgId');
  const db = c.get('db');

  const existing = await db.prepare(
    'SELECT id FROM env_vars WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
  ).bind(envId, key).first<EnvVarRow>();
  if (!existing) return c.json({ error: 'Var not found' }, 404);

  await softDelete(db, 'env_vars', existing.id);
  await auditLog(db, { orgId, actorUserId: user.id, action: 'var.delete', targetType: 'env_var', targetId: key, metadata: { envId } });
  return c.body(null, 204);
});

export const varRoutes = app;
