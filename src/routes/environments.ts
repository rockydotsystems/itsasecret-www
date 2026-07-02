import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authMiddleware, getSessionKey, getOrgKey } from '../auth/middleware';
import { requireOrgRole, requireEnvRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '../rbac/middleware';
import { generateId, auditLog, softDelete } from '../db/utils';
import { decrypt, encrypt } from '../crypto/envelope';
import type { EnvRow, EnvVarRow, SecretRow, EnvPermissionRow, ProjectRow, OrgMemberRow } from '../types';

const app = new OpenAPIHono();

const errorSchema = z.object({ error: z.string() });

const envSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  parent_env_id: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
});

const permissionSchema = z.object({
  env_id: z.string(),
  user_id: z.string(),
  role: z.string(),
  created_at: z.string(),
});

const listEnvsRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/envs',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])],
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(envSchema) } },
      description: 'List environments',
    },
  },
});

const createEnvRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/envs',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN])],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ name: z.string().min(1) }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: envSchema } },
      description: 'Environment created',
    },
    409: { content: { 'application/json': { schema: errorSchema } }, description: 'Name already exists' },
  },
});

const forkEnvRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/envs/{envId}/fork',
  middleware: [authMiddleware, requireEnvRole([ROLE_READ, ROLE_WRITE, ROLE_ADMIN])],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ name: z.string().min(1) }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: envSchema } },
      description: 'Environment forked',
    },
    409: { content: { 'application/json': { schema: errorSchema } }, description: 'Name already exists' },
  },
});

const getEnvRoute = createRoute({
  method: 'get',
  path: '/envs/{envId}',
  middleware: [authMiddleware, requireEnvRole([ROLE_READ, ROLE_WRITE, ROLE_ADMIN])],
  responses: {
    200: {
      content: { 'application/json': { schema: envSchema } },
      description: 'Environment details',
    },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

const deleteEnvRoute = createRoute({
  method: 'delete',
  path: '/envs/{envId}',
  middleware: [authMiddleware, requireEnvRole([ROLE_ADMIN])],
  responses: {
    204: { description: 'Environment deleted' },
  },
});

const listPermissionsRoute = createRoute({
  method: 'get',
  path: '/envs/{envId}/permissions',
  middleware: [authMiddleware, requireEnvRole([ROLE_READ, ROLE_WRITE, ROLE_ADMIN])],
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(permissionSchema) } },
      description: 'List permissions',
    },
  },
});

const grantPermissionRoute = createRoute({
  method: 'post',
  path: '/envs/{envId}/permissions',
  middleware: [authMiddleware, requireEnvRole([ROLE_ADMIN])],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            userId: z.string(),
            role: z.enum([ROLE_READ, ROLE_WRITE, ROLE_ADMIN]),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: permissionSchema } },
      description: 'Permission granted',
    },
    409: { content: { 'application/json': { schema: errorSchema } }, description: 'Permission already exists' },
  },
});

const revokePermissionRoute = createRoute({
  method: 'delete',
  path: '/envs/{envId}/permissions/{userId}',
  middleware: [authMiddleware, requireEnvRole([ROLE_ADMIN])],
  responses: {
    204: { description: 'Permission revoked' },
  },
});

const pullRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/envs/{envName}/pull',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            vars: z.array(z.object({ key: z.string(), value: z.string() })),
            secrets: z.record(z.string(), z.string()),
          }),
        },
      },
      description: 'Pull environment data',
    },
    403: { content: { 'application/json': { schema: errorSchema } }, description: 'No access' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

app.openapi(listEnvsRoute, async (c) => {
  const projectId = c.req.param('projectId');
  const db = c.get('db');
  const result = await db.prepare(
    'SELECT * FROM environments WHERE project_id = ? AND deleted_at IS NULL'
  ).bind(projectId).all<EnvRow>();
  return c.json(result.results, 200);
});

app.openapi(createEnvRoute, async (c) => {
  const projectId = c.req.param('projectId');
  const { name } = c.req.valid('json');
  const user = c.get('user');
  const orgId = c.get('orgId');
  const db = c.get('db');

  const existing = await db.prepare(
    'SELECT id FROM environments WHERE project_id = ? AND name = ? AND deleted_at IS NULL'
  ).bind(projectId, name).first();
  if (existing) return c.json({ error: 'Environment name already exists' }, 409);

  const envId = generateId();
  await db.prepare(
    'INSERT INTO environments (id, project_id, name, created_by) VALUES (?, ?, ?, ?)'
  ).bind(envId, projectId, name, user.id).run();

  await auditLog(db, { orgId, actorUserId: user.id, action: 'env.create', targetType: 'env', targetId: envId });

  const env = await db.prepare('SELECT * FROM environments WHERE id = ?').bind(envId).first<EnvRow>();
  return c.json(env as EnvRow, 201);
});

app.openapi(forkEnvRoute, async (c) => {
  const projectId = c.req.param('projectId');
  const parentEnvId = c.req.param('envId');
  const { name } = c.req.valid('json');
  const user = c.get('user');
  const orgId = c.get('orgId');
  const db = c.get('db');

  const existing = await db.prepare(
    'SELECT id FROM environments WHERE project_id = ? AND name = ? AND deleted_at IS NULL'
  ).bind(projectId, name).first();
  if (existing) return c.json({ error: 'Environment name already exists' }, 409);

  const newEnvId = generateId();
  await db.prepare(
    'INSERT INTO environments (id, project_id, name, parent_env_id, created_by) VALUES (?, ?, ?, ?, ?)'
  ).bind(newEnvId, projectId, name, parentEnvId, user.id).run();

  await db.prepare(
    'INSERT INTO env_permissions (env_id, user_id, role) VALUES (?, ?, ?)'
  ).bind(newEnvId, user.id, ROLE_ADMIN).run();

  const parentVars = await db.prepare(
    'SELECT key, value FROM env_vars WHERE env_id = ? AND deleted_at IS NULL'
  ).bind(parentEnvId).all<EnvVarRow>();
  for (const v of parentVars.results) {
    await db.prepare(
      'INSERT INTO env_vars (id, env_id, key, value, created_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), newEnvId, v.key, v.value, user.id).run();
  }

  const parentSecrets = await db.prepare(
    'SELECT key, encrypted_value FROM secrets WHERE env_id = ? AND deleted_at IS NULL'
  ).bind(parentEnvId).all<SecretRow>();
  for (const s of parentSecrets.results) {
    await db.prepare(
      'INSERT INTO secrets (id, env_id, key, encrypted_value, created_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), newEnvId, s.key, s.encrypted_value, user.id).run();
  }

  await auditLog(db, { orgId, actorUserId: user.id, action: 'env.fork', targetType: 'env', targetId: newEnvId, metadata: { parentEnvId } });

  const env = await db.prepare('SELECT * FROM environments WHERE id = ?').bind(newEnvId).first<EnvRow>();
  return c.json(env as EnvRow, 201);
});

app.openapi(getEnvRoute, async (c) => {
  const envId = c.req.param('envId');
  const db = c.get('db');
  const env = await db.prepare('SELECT * FROM environments WHERE id = ? AND deleted_at IS NULL').bind(envId).first<EnvRow>();
  if (!env) return c.json({ error: 'Environment not found' }, 404);
  return c.json(env, 200);
});

app.openapi(deleteEnvRoute, async (c) => {
  const envId = c.req.param('envId');
  const user = c.get('user');
  const orgId = c.get('orgId');
  const db = c.get('db');
  await softDelete(db, 'environments', envId);
  await auditLog(db, { orgId, actorUserId: user.id, action: 'env.delete', targetType: 'env', targetId: envId });
  return c.body(null, 204);
});

app.openapi(listPermissionsRoute, async (c) => {
  const envId = c.req.param('envId');
  const db = c.get('db');
  const result = await db.prepare(
    'SELECT * FROM env_permissions WHERE env_id = ?'
  ).bind(envId).all<EnvPermissionRow>();
  return c.json(result.results, 200);
});

app.openapi(grantPermissionRoute, async (c) => {
  const envId = c.req.param('envId');
  const { userId, role } = c.req.valid('json');
  const user = c.get('user');
  const orgId = c.get('orgId');
  const db = c.get('db');

  const existing = await db.prepare(
    'SELECT * FROM env_permissions WHERE env_id = ? AND user_id = ?'
  ).bind(envId, userId).first();
  if (existing) return c.json({ error: 'Permission already exists' }, 409);

  await db.prepare(
    'INSERT INTO env_permissions (env_id, user_id, role) VALUES (?, ?, ?)'
  ).bind(envId, userId, role).run();

  await auditLog(db, { orgId, actorUserId: user.id, action: 'env.permission.grant', targetType: 'env', targetId: envId, metadata: { userId, role } });

  const perm = await db.prepare(
    'SELECT * FROM env_permissions WHERE env_id = ? AND user_id = ?'
  ).bind(envId, userId).first<EnvPermissionRow>();
  return c.json(perm as EnvPermissionRow, 201);
});

app.openapi(revokePermissionRoute, async (c) => {
  const envId = c.req.param('envId');
  const userId = c.req.param('userId');
  const user = c.get('user');
  const orgId = c.get('orgId');
  const db = c.get('db');

  await db.prepare('DELETE FROM env_permissions WHERE env_id = ? AND user_id = ?').bind(envId, userId).run();
  await auditLog(db, { orgId, actorUserId: user.id, action: 'env.permission.revoke', targetType: 'env', targetId: envId, metadata: { userId } });
  return c.body(null, 204);
});

app.openapi(pullRoute, async (c) => {
  const projectId = c.req.param('projectId');
  const envName = c.req.param('envName');
  const user = c.get('user');
  const orgId = c.get('orgId');
  const session = c.get('session');
  const db = c.get('db');

  const project = await db.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL').bind(projectId).first<ProjectRow>();
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const env = await db.prepare(
    'SELECT * FROM environments WHERE project_id = ? AND name = ? AND deleted_at IS NULL'
  ).bind(projectId, envName).first<EnvRow>();
  if (!env) return c.json({ error: 'Environment not found' }, 404);

  const member = await db.prepare(
    'SELECT * FROM org_members WHERE org_id = ? AND user_id = ?'
  ).bind(orgId, user.id).first<OrgMemberRow>();

  if (!member || (member.role !== ORG_ROLE_OWNER && member.role !== ORG_ROLE_ADMIN)) {
    const perm = await db.prepare(
      'SELECT * FROM env_permissions WHERE env_id = ? AND user_id = ?'
    ).bind(env.id, user.id).first<EnvPermissionRow>();
    if (!perm) return c.json({ error: 'No access to this environment' }, 403);
  }

  const sessionKey = getSessionKey(c.req.header('X-Session-Key'));
  const orgKey = await getOrgKey(session, sessionKey, orgId);

  const varResult = await db.prepare(
    'SELECT key, value FROM env_vars WHERE env_id = ? AND deleted_at IS NULL'
  ).bind(env.id).all<EnvVarRow>();

  const secretResult = await db.prepare(
    'SELECT key, encrypted_value FROM secrets WHERE env_id = ? AND deleted_at IS NULL'
  ).bind(env.id).all<SecretRow>();

  const secrets: Record<string, string> = {};
  for (const s of secretResult.results) {
    const plaintext = await decrypt(orgKey, s.encrypted_value);
    secrets[s.key] = await encrypt(sessionKey, plaintext);
  }

  return c.json({
    vars: varResult.results.map((v: { key: string; value: string }) => ({ key: v.key, value: v.value })),
    secrets,
  }, 200);
});

export const envRoutes = app;
