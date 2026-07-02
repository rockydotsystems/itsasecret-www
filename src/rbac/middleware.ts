import { createMiddleware } from 'hono/factory';
import type { OrgMemberRow, EnvRow, ProjectRow, EnvPermissionRow } from '../types';

export const ORG_ROLE_OWNER = 'owner';
export const ORG_ROLE_ADMIN = 'admin';
export const ORG_ROLE_MEMBER = 'member';

export const ROLE_READ = 'read';
export const ROLE_WRITE = 'write';
export const ROLE_ADMIN = 'admin';

type DBEnv = {
  Bindings: { DB: D1Database };
};

export function requireOrgRole(allowedRoles: string[]) {
  return createMiddleware<DBEnv>(async (c, next) => {
    const user = c.get('user');
    let orgId = c.req.param('orgId');

    if (!orgId) {
      const projectId = c.req.param('projectId');
      const envId = c.req.param('envId');

      if (projectId) {
        const project = await c.env.DB.prepare(
          'SELECT org_id FROM projects WHERE id = ? AND deleted_at IS NULL'
        ).bind(projectId).first<{ org_id: string }>();
        if (!project) return c.json({ error: 'Project not found' }, 404);
        orgId = project.org_id;
      } else if (envId) {
        const env = await c.env.DB.prepare(
          'SELECT project_id FROM environments WHERE id = ? AND deleted_at IS NULL'
        ).bind(envId).first<{ project_id: string }>();
        if (!env) return c.json({ error: 'Environment not found' }, 404);
        const project = await c.env.DB.prepare(
          'SELECT org_id FROM projects WHERE id = ? AND deleted_at IS NULL'
        ).bind(env.project_id).first<{ org_id: string }>();
        if (!project) return c.json({ error: 'Project not found' }, 404);
        orgId = project.org_id;
      }
    }

    if (!orgId) return c.json({ error: 'Organization not found' }, 404);

    const member = await c.env.DB.prepare(
      'SELECT * FROM org_members WHERE org_id = ? AND user_id = ?'
    ).bind(orgId, user.id).first<OrgMemberRow>();

    if (!member) return c.json({ error: 'Not a member of this organization' }, 403);
    if (!allowedRoles.includes(member.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    c.set('orgId', orgId);
    await next();
  });
}

export function requireEnvRole(allowedRoles: string[]) {
  return createMiddleware<DBEnv>(async (c, next) => {
    const user = c.get('user');
    const envId = c.req.param('envId');

    if (!envId) return c.json({ error: 'Environment ID required' }, 400);

    const env = await c.env.DB.prepare(
      'SELECT * FROM environments WHERE id = ? AND deleted_at IS NULL'
    ).bind(envId).first<EnvRow>();
    if (!env) return c.json({ error: 'Environment not found' }, 404);

    const project = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL'
    ).bind(env.project_id).first<ProjectRow>();
    if (!project) return c.json({ error: 'Project not found' }, 404);

    const orgId = project.org_id;

    const member = await c.env.DB.prepare(
      'SELECT * FROM org_members WHERE org_id = ? AND user_id = ?'
    ).bind(orgId, user.id).first<OrgMemberRow>();

    if (!member) return c.json({ error: 'Not a member of this organization' }, 403);

    if (member.role === ORG_ROLE_OWNER || member.role === ORG_ROLE_ADMIN) {
      c.set('orgId', orgId);
      await next();
      return;
    }

    const perm = await c.env.DB.prepare(
      'SELECT * FROM env_permissions WHERE env_id = ? AND user_id = ?'
    ).bind(envId, user.id).first<EnvPermissionRow>();

    if (!perm) return c.json({ error: 'No access to this environment' }, 403);
    if (!allowedRoles.includes(perm.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    c.set('orgId', orgId);
    await next();
  });
}
