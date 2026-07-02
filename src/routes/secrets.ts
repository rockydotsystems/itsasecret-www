import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authMiddleware, getSessionKey, getOrgKey } from '../auth/middleware';
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '../rbac/middleware';
import { encrypt, decrypt } from '../crypto/envelope';
import { generateId, auditLog, softDelete } from '../db/utils';
import type { SecretRow } from '../types';

const app = new OpenAPIHono();

const errorSchema = z.object({ error: z.string() });

const secretItemSchema = z.object({
  key: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const listSecretsRoute = createRoute({
  method: 'get',
  path: '/envs/{envId}/secrets',
  middleware: [authMiddleware, requireEnvRole([ROLE_READ, ROLE_WRITE, ROLE_ADMIN])],
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(secretItemSchema) } },
      description: 'List secrets (metadata only)',
    },
  },
});

const upsertSecretRoute = createRoute({
  method: 'put',
  path: '/envs/{envId}/secrets/{key}',
  middleware: [authMiddleware, requireEnvRole([ROLE_WRITE, ROLE_ADMIN])],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ encryptedValue: z.string() }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: secretItemSchema } },
      description: 'Secret upserted',
    },
  },
});

const revealSecretRoute = createRoute({
  method: 'get',
  path: '/envs/{envId}/secrets/{key}',
  middleware: [authMiddleware, requireEnvRole([ROLE_READ, ROLE_WRITE, ROLE_ADMIN])],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ key: z.string(), encryptedValue: z.string() }),
        },
      },
      description: 'Secret revealed (encrypted with session key)',
    },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

const deleteSecretRoute = createRoute({
  method: 'delete',
  path: '/envs/{envId}/secrets/{key}',
  middleware: [authMiddleware, requireEnvRole([ROLE_WRITE, ROLE_ADMIN])],
  responses: {
    204: { description: 'Secret deleted' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

app.openapi(listSecretsRoute, async (c) => {
  const envId = c.req.param('envId');
  const db = c.get('db');
  const result = await db.prepare(
    'SELECT key, created_at, updated_at FROM secrets WHERE env_id = ? AND deleted_at IS NULL'
  ).bind(envId).all<{ key: string; created_at: string; updated_at: string }>();
  return c.json(result.results, 200);
});

app.openapi(upsertSecretRoute, async (c) => {
  const envId = c.req.param('envId');
  const key = c.req.param('key');
  const { encryptedValue } = c.req.valid('json');
  const user = c.get('user');
  const session = c.get('session');
  const orgId = c.get('orgId');
  const db = c.get('db');

  const sessionKey = getSessionKey(c.req.header('X-Session-Key'));
  const orgKey = await getOrgKey(session, sessionKey, orgId);

  const plaintext = await decrypt(sessionKey, encryptedValue);
  const storedEncrypted = await encrypt(orgKey, plaintext);

  const existing = await db.prepare(
    'SELECT * FROM secrets WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
  ).bind(envId, key).first<SecretRow>();

  if (existing) {
    await db.prepare(
      `UPDATE secrets SET encrypted_value = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(storedEncrypted, existing.id).run();
  } else {
    const deleted = await db.prepare(
      'SELECT id FROM secrets WHERE env_id = ? AND key = ? AND deleted_at IS NOT NULL'
    ).bind(envId, key).first<SecretRow>();

    if (deleted) {
      await db.prepare(
        `UPDATE secrets SET encrypted_value = ?, deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`
      ).bind(storedEncrypted, deleted.id).run();
    } else {
      const secretId = generateId();
      await db.prepare(
        'INSERT INTO secrets (id, env_id, key, encrypted_value, created_by) VALUES (?, ?, ?, ?, ?)'
      ).bind(secretId, envId, key, storedEncrypted, user.id).run();
    }
  }

  await auditLog(db, { orgId, actorUserId: user.id, action: 'secret.upsert', targetType: 'secret', targetId: key, metadata: { envId } });

  const updated = await db.prepare(
    'SELECT key, created_at, updated_at FROM secrets WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
  ).bind(envId, key).first<{ key: string; created_at: string; updated_at: string }>();
  return c.json(updated as { key: string; created_at: string; updated_at: string }, 200);
});

app.openapi(revealSecretRoute, async (c) => {
  const envId = c.req.param('envId');
  const key = c.req.param('key');
  const session = c.get('session');
  const orgId = c.get('orgId');
  const db = c.get('db');

  const secret = await db.prepare(
    'SELECT * FROM secrets WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
  ).bind(envId, key).first<SecretRow>();
  if (!secret) return c.json({ error: 'Secret not found' }, 404);

  const sessionKey = getSessionKey(c.req.header('X-Session-Key'));
  const orgKey = await getOrgKey(session, sessionKey, orgId);

  const plaintext = await decrypt(orgKey, secret.encrypted_value);
  const transportEncrypted = await encrypt(sessionKey, plaintext);

  await auditLog(db, { orgId, actorUserId: c.get('user').id, action: 'secret.reveal', targetType: 'secret', targetId: key, metadata: { envId } });

  return c.json({ key, encryptedValue: transportEncrypted }, 200);
});

app.openapi(deleteSecretRoute, async (c) => {
  const envId = c.req.param('envId');
  const key = c.req.param('key');
  const user = c.get('user');
  const orgId = c.get('orgId');
  const db = c.get('db');

  const existing = await db.prepare(
    'SELECT id FROM secrets WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
  ).bind(envId, key).first<SecretRow>();
  if (!existing) return c.json({ error: 'Secret not found' }, 404);

  await softDelete(db, 'secrets', existing.id);
  await auditLog(db, { orgId, actorUserId: user.id, action: 'secret.delete', targetType: 'secret', targetId: key, metadata: { envId } });
  return c.body(null, 204);
});

export const secretRoutes = app;
