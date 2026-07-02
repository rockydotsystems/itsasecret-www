import { createMiddleware } from 'hono/factory';
import { base64Encode, base64Decode } from '../crypto/base64';
import { decrypt } from '../crypto/envelope';

export const dbMiddleware = createMiddleware<{
  Bindings: { DB: D1Database };
}>(async (c, next) => {
  c.set('db', c.env.DB);
  await next();
});

export const authMiddleware = createMiddleware<{
  Bindings: { DB: D1Database };
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }
  const token = authHeader.slice(7);
  let tokenBytes: Uint8Array;
  try {
    tokenBytes = base64Decode(token);
  } catch {
    return c.json({ error: 'Invalid token format' }, 401);
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes);
  const tokenHash = base64Encode(new Uint8Array(hashBuffer));

  const db = c.env.DB;
  const session = await db.prepare(
    `SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > datetime('now')`
  ).bind(tokenHash).first<import('../types').SessionRow>();

  if (!session) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first<import('../types').UserRow>();
  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  c.set('db', db);
  c.set('user', user);
  c.set('session', session);
  await next();
});

export const requireAuth = authMiddleware;

export function getSessionKey(headerValue: string | undefined): Uint8Array {
  if (!headerValue) throw new Error('Missing X-Session-Key header');
  return base64Decode(headerValue);
}

export async function getOrgKey(
  session: { encrypted_org_keys: string },
  sessionKey: Uint8Array,
  orgId: string
): Promise<Uint8Array> {
  const encryptedOrgKeys: Record<string, string> = JSON.parse(session.encrypted_org_keys);
  const encryptedOrgKey = encryptedOrgKeys[orgId];
  if (!encryptedOrgKey) throw new Error('No org key for this organization');
  const orgKeyB64 = await decrypt(sessionKey, encryptedOrgKey);
  return base64Decode(orgKeyB64);
}
