import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authMiddleware } from '../auth/middleware';
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '../rbac/middleware';
import { generateId, auditLog, softDelete } from '../db/utils';
import type { OrgRow, OrgMemberRow, UserRow } from '../types';

const app = new OpenAPIHono();

const errorSchema = z.object({ error: z.string() });

const orgSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  owner_user_id: z.string(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
});

const memberSchema = z.object({
  org_id: z.string(),
  user_id: z.string(),
  role: z.string(),
  invited_by: z.string().nullable(),
  created_at: z.string(),
});

const listOrgsRoute = createRoute({
  method: 'get',
  path: '/orgs',
  middleware: [authMiddleware],
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(orgSchema) } },
      description: 'List orgs',
    },
  },
});

const createOrgRoute = createRoute({
  method: 'post',
  path: '/orgs',
  middleware: [authMiddleware],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1),
            wrappedOrgKey: z.string(),
            encryptedOrgKey: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: orgSchema } },
      description: 'Org created',
    },
  },
});

const getOrgRoute = createRoute({
  method: 'get',
  path: '/orgs/{orgId}',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])],
  responses: {
    200: {
      content: { 'application/json': { schema: orgSchema } },
      description: 'Org details',
    },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

const updateOrgRoute = createRoute({
  method: 'patch',
  path: '/orgs/{orgId}',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN])],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1).optional(),
            ownerUserId: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: orgSchema } },
      description: 'Org updated',
    },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

const deleteOrgRoute = createRoute({
  method: 'delete',
  path: '/orgs/{orgId}',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER])],
  responses: {
    204: { description: 'Org deleted' },
    403: { content: { 'application/json': { schema: errorSchema } }, description: 'Forbidden' },
  },
});

const listMembersRoute = createRoute({
  method: 'get',
  path: '/orgs/{orgId}/members',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])],
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(memberSchema) } },
      description: 'List members',
    },
  },
});

const inviteRoute = createRoute({
  method: 'post',
  path: '/orgs/{orgId}/invite',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN])],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email(),
            role: z.enum([ORG_ROLE_ADMIN, ORG_ROLE_MEMBER]),
            wrappedOrgKey: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: memberSchema } },
      description: 'Member invited',
    },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'User not found' },
    409: { content: { 'application/json': { schema: errorSchema } }, description: 'Already a member' },
  },
});

const removeMemberRoute = createRoute({
  method: 'delete',
  path: '/orgs/{orgId}/members/{userId}',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN])],
  responses: {
    204: { description: 'Member removed' },
    403: { content: { 'application/json': { schema: errorSchema } }, description: 'Cannot remove owner' },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Org not found' },
  },
});

app.openapi(listOrgsRoute, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const result = await db.prepare(
    `SELECT o.* FROM orgs o JOIN org_members m ON o.id = m.org_id WHERE m.user_id = ? AND o.deleted_at IS NULL`
  ).bind(user.id).all<OrgRow>();
  return c.json(result.results, 200);
});

app.openapi(createOrgRoute, async (c) => {
  const { name, wrappedOrgKey, encryptedOrgKey } = c.req.valid('json');
  const user = c.get('user');
  const session = c.get('session');
  const db = c.get('db');

  const orgId = generateId();
  await db.prepare(
    'INSERT INTO orgs (id, name, kind, owner_user_id) VALUES (?, ?, ?, ?)'
  ).bind(orgId, name, 'shared', user.id).run();

  await db.prepare(
    'INSERT INTO org_members (org_id, user_id, role, wrapped_org_key) VALUES (?, ?, ?, ?)'
  ).bind(orgId, user.id, ORG_ROLE_OWNER, wrappedOrgKey).run();

  const encryptedOrgKeys: Record<string, string> = JSON.parse(session.encrypted_org_keys);
  encryptedOrgKeys[orgId] = encryptedOrgKey;
  await db.prepare('UPDATE sessions SET encrypted_org_keys = ? WHERE id = ?')
    .bind(JSON.stringify(encryptedOrgKeys), session.id).run();

  await auditLog(db, { orgId, actorUserId: user.id, action: 'org.create', targetType: 'org', targetId: orgId });

  const org = await db.prepare('SELECT * FROM orgs WHERE id = ?').bind(orgId).first<OrgRow>();
  return c.json(org as OrgRow, 201);
});

app.openapi(getOrgRoute, async (c) => {
  const orgId = c.req.param('orgId');
  const db = c.get('db');
  const org = await db.prepare('SELECT * FROM orgs WHERE id = ? AND deleted_at IS NULL').bind(orgId).first<OrgRow>();
  if (!org) return c.json({ error: 'Org not found' }, 404);
  return c.json(org, 200);
});

app.openapi(updateOrgRoute, async (c) => {
  const orgId = c.req.param('orgId');
  const body = c.req.valid('json');
  const user = c.get('user');
  const db = c.get('db');

  const org = await db.prepare('SELECT * FROM orgs WHERE id = ? AND deleted_at IS NULL').bind(orgId).first<OrgRow>();
  if (!org) return c.json({ error: 'Org not found' }, 404);

  if (body.name) {
    await db.prepare('UPDATE orgs SET name = ? WHERE id = ?').bind(body.name, orgId).run();
  }

  if (body.ownerUserId) {
    const newOwner = await db.prepare(
      'SELECT * FROM org_members WHERE org_id = ? AND user_id = ?'
    ).bind(orgId, body.ownerUserId).first<OrgMemberRow>();
    if (!newOwner) return c.json({ error: 'New owner is not a member' }, 404);

    await db.prepare('UPDATE orgs SET owner_user_id = ? WHERE id = ?').bind(body.ownerUserId, orgId).run();
    await db.prepare('UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?')
      .bind(ORG_ROLE_OWNER, orgId, body.ownerUserId).run();
    await db.prepare('UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?')
      .bind(ORG_ROLE_ADMIN, orgId, org.owner_user_id).run();

    await auditLog(db, { orgId, actorUserId: user.id, action: 'org.transfer', targetType: 'org', targetId: orgId, metadata: { newOwner: body.ownerUserId } });
  }

  const updated = await db.prepare('SELECT * FROM orgs WHERE id = ?').bind(orgId).first<OrgRow>();
  return c.json(updated as OrgRow, 200);
});

app.openapi(deleteOrgRoute, async (c) => {
  const orgId = c.req.param('orgId');
  const user = c.get('user');
  const db = c.get('db');
  await softDelete(db, 'orgs', orgId);
  await auditLog(db, { orgId, actorUserId: user.id, action: 'org.delete', targetType: 'org', targetId: orgId });
  return c.body(null, 204);
});

app.openapi(listMembersRoute, async (c) => {
  const orgId = c.req.param('orgId');
  const db = c.get('db');
  const result = await db.prepare(
    `SELECT org_id, user_id, role, invited_by, created_at FROM org_members WHERE org_id = ?`
  ).bind(orgId).all<OrgMemberRow>();
  return c.json(result.results, 200);
});

app.openapi(inviteRoute, async (c) => {
  const orgId = c.req.param('orgId');
  const { email, role, wrappedOrgKey } = c.req.valid('json');
  const user = c.get('user');
  const db = c.get('db');

  const invitee = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!invitee) return c.json({ error: 'User not found' }, 404);

  const existing = await db.prepare(
    'SELECT * FROM org_members WHERE org_id = ? AND user_id = ?'
  ).bind(orgId, invitee.id).first<OrgMemberRow>();
  if (existing) return c.json({ error: 'User is already a member' }, 409);

  await db.prepare(
    'INSERT INTO org_members (org_id, user_id, role, wrapped_org_key, invited_by) VALUES (?, ?, ?, ?, ?)'
  ).bind(orgId, invitee.id, role, wrappedOrgKey, user.id).run();

  await auditLog(db, { orgId, actorUserId: user.id, action: 'member.invite', targetType: 'user', targetId: invitee.id, metadata: { role } });

  const member = await db.prepare(
    'SELECT org_id, user_id, role, invited_by, created_at FROM org_members WHERE org_id = ? AND user_id = ?'
  ).bind(orgId, invitee.id).first<OrgMemberRow>();
  return c.json(member as OrgMemberRow, 201);
});

app.openapi(removeMemberRoute, async (c) => {
  const orgId = c.req.param('orgId');
  const userId = c.req.param('userId');
  const user = c.get('user');
  const db = c.get('db');

  const org = await db.prepare('SELECT * FROM orgs WHERE id = ? AND deleted_at IS NULL').bind(orgId).first<OrgRow>();
  if (!org) return c.json({ error: 'Org not found' }, 404);
  if (org.owner_user_id === userId) return c.json({ error: 'Cannot remove the org owner' }, 403);

  await db.prepare('DELETE FROM org_members WHERE org_id = ? AND user_id = ?').bind(orgId, userId).run();
  await auditLog(db, { orgId, actorUserId: user.id, action: 'member.remove', targetType: 'user', targetId: userId });
  return c.body(null, 204);
});

export const orgRoutes = app;
