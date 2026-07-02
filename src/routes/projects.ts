import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authMiddleware } from '../auth/middleware';
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '../rbac/middleware';
import { generateId, auditLog, softDelete } from '../db/utils';
import type { ProjectRow } from '../types';

const app = new OpenAPIHono();

const errorSchema = z.object({ error: z.string() });

const projectSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  name: z.string(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
});

const listProjectsRoute = createRoute({
  method: 'get',
  path: '/orgs/{orgId}/projects',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])],
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(projectSchema) } },
      description: 'List projects',
    },
  },
});

const createProjectRoute = createRoute({
  method: 'post',
  path: '/orgs/{orgId}/projects',
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
      content: { 'application/json': { schema: projectSchema } },
      description: 'Project created',
    },
    409: { content: { 'application/json': { schema: errorSchema } }, description: 'Project name already exists' },
  },
});

const getProjectRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])],
  responses: {
    200: {
      content: { 'application/json': { schema: projectSchema } },
      description: 'Project details',
    },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

const updateProjectRoute = createRoute({
  method: 'patch',
  path: '/projects/{projectId}',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN])],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ name: z.string().min(1).optional() }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: projectSchema } },
      description: 'Project updated',
    },
    404: { content: { 'application/json': { schema: errorSchema } }, description: 'Not found' },
  },
});

const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/projects/{projectId}',
  middleware: [authMiddleware, requireOrgRole([ORG_ROLE_OWNER, ORG_ROLE_ADMIN])],
  responses: {
    204: { description: 'Project deleted' },
  },
});

app.openapi(listProjectsRoute, async (c) => {
  const orgId = c.req.param('orgId');
  const db = c.get('db');
  const result = await db.prepare(
    'SELECT * FROM projects WHERE org_id = ? AND deleted_at IS NULL'
  ).bind(orgId).all<ProjectRow>();
  return c.json(result.results, 200);
});

app.openapi(createProjectRoute, async (c) => {
  const orgId = c.req.param('orgId');
  const { name } = c.req.valid('json');
  const user = c.get('user');
  const db = c.get('db');

  const existing = await db.prepare(
    'SELECT id FROM projects WHERE org_id = ? AND name = ? AND deleted_at IS NULL'
  ).bind(orgId, name).first();
  if (existing) return c.json({ error: 'Project name already exists' }, 409);

  const projectId = generateId();
  await db.prepare(
    'INSERT INTO projects (id, org_id, name) VALUES (?, ?, ?)'
  ).bind(projectId, orgId, name).run();

  await auditLog(db, { orgId, actorUserId: user.id, action: 'project.create', targetType: 'project', targetId: projectId });

  const project = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<ProjectRow>();
  return c.json(project as ProjectRow, 201);
});

app.openapi(getProjectRoute, async (c) => {
  const projectId = c.req.param('projectId');
  const db = c.get('db');
  const project = await db.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL').bind(projectId).first<ProjectRow>();
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json(project, 200);
});

app.openapi(updateProjectRoute, async (c) => {
  const projectId = c.req.param('projectId');
  const { name } = c.req.valid('json');
  const user = c.get('user');
  const orgId = c.get('orgId');
  const db = c.get('db');

  const project = await db.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL').bind(projectId).first<ProjectRow>();
  if (!project) return c.json({ error: 'Project not found' }, 404);

  if (name) {
    await db.prepare('UPDATE projects SET name = ? WHERE id = ?').bind(name, projectId).run();
  }

  await auditLog(db, { orgId, actorUserId: user.id, action: 'project.update', targetType: 'project', targetId: projectId });

  const updated = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<ProjectRow>();
  return c.json(updated as ProjectRow, 200);
});

app.openapi(deleteProjectRoute, async (c) => {
  const projectId = c.req.param('projectId');
  const user = c.get('user');
  const orgId = c.get('orgId');
  const db = c.get('db');
  await softDelete(db, 'projects', projectId);
  await auditLog(db, { orgId, actorUserId: user.id, action: 'project.delete', targetType: 'project', targetId: projectId });
  return c.body(null, 204);
});

export const projectRoutes = app;
