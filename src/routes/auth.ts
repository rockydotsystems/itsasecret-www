import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authMiddleware, dbMiddleware } from '../auth/middleware';
import { createSession, revokeSession } from '../auth/sessions';
import { deriveKey, hashPassword, verifyPassword, DEFAULT_KDF_PARAMS } from '../crypto/kdf';
import type { KdfParams } from '../crypto/kdf';
import { generateKey, wrapKey, unwrapKey, encrypt } from '../crypto/envelope';
import { generateKeyPair, deriveSessionKey } from '../crypto/ecdh';
import { base64Encode, base64Decode } from '../crypto/base64';
import { generateId, auditLog } from '../db/utils';
import type { UserRow, OrgMemberRow } from '../types';

const app = new OpenAPIHono();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  clientPubkey: z.string(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  clientPubkey: z.string(),
});

const authResponseSchema = z.object({
  token: z.string(),
  serverPubkey: z.string(),
  orgKeys: z.record(z.string(), z.string()),
});

const errorSchema = z.object({ error: z.string() });

const registerRoute = createRoute({
  method: 'post',
  path: '/auth/register',
  middleware: [dbMiddleware],
  request: {
    body: { content: { 'application/json': { schema: registerSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: authResponseSchema } },
      description: 'Account created',
    },
    409: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Email already registered',
    },
  },
});

const loginRoute = createRoute({
  method: 'post',
  path: '/auth/login',
  middleware: [dbMiddleware],
  request: {
    body: { content: { 'application/json': { schema: loginSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: authResponseSchema } },
      description: 'Session created',
    },
    401: {
      content: { 'application/json': { schema: errorSchema } },
      description: 'Invalid credentials',
    },
  },
});

const logoutRoute = createRoute({
  method: 'post',
  path: '/auth/logout',
  middleware: [authMiddleware],
  responses: {
    204: { description: 'Logged out' },
  },
});

app.openapi(registerRoute, async (c) => {
  const { email, password, clientPubkey } = c.req.valid('json');
  const db = c.get('db');

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = base64Encode(salt);

  const derivedKey = await deriveKey(password, salt);
  const passwordHash = await hashPassword(password, salt);

  const orgKey = generateKey();
  const wrappedOrgKey = await wrapKey(derivedKey, orgKey);

  const userId = generateId();
  await db.prepare(
    'INSERT INTO users (id, email, password_hash, kdf_salt, kdf_params) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, email, passwordHash, saltB64, JSON.stringify(DEFAULT_KDF_PARAMS)).run();

  const orgId = generateId();
  await db.prepare(
    'INSERT INTO orgs (id, name, kind, owner_user_id) VALUES (?, ?, ?, ?)'
  ).bind(orgId, `${email}'s org`, 'personal', userId).run();

  await db.prepare(
    'INSERT INTO org_members (org_id, user_id, role, wrapped_org_key) VALUES (?, ?, ?, ?)'
  ).bind(orgId, userId, 'owner', wrappedOrgKey).run();

  const { publicKey: serverPubkey, privateKey } = await generateKeyPair();
  const sessionKey = await deriveSessionKey(privateKey, clientPubkey);

  const encryptedOrgKey = await encrypt(sessionKey, base64Encode(orgKey));
  const orgKeys: Record<string, string> = { [orgId]: encryptedOrgKey };

  const { token } = await createSession(db, userId, serverPubkey, orgKeys);

  await auditLog(db, { actorUserId: userId, action: 'user.register', targetType: 'user', targetId: userId });
  await auditLog(db, { orgId, actorUserId: userId, action: 'org.create', targetType: 'org', targetId: orgId });

  return c.json({ token, serverPubkey, orgKeys }, 201);
});

app.openapi(loginRoute, async (c) => {
  const { email, password, clientPubkey } = c.req.valid('json');
  const db = c.get('db');

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const salt = base64Decode(user.kdf_salt);
  const params: KdfParams = JSON.parse(user.kdf_params);
  const derivedKey = await deriveKey(password, salt, params);

  const members = await db.prepare(
    'SELECT * FROM org_members WHERE user_id = ?'
  ).bind(user.id).all<OrgMemberRow>();

  const { publicKey: serverPubkey, privateKey } = await generateKeyPair();
  const sessionKey = await deriveSessionKey(privateKey, clientPubkey);

  const orgKeys: Record<string, string> = {};
  for (const member of members.results) {
    const orgKey = await unwrapKey(derivedKey, member.wrapped_org_key);
    orgKeys[member.org_id] = await encrypt(sessionKey, base64Encode(orgKey));
  }

  const { token } = await createSession(db, user.id, serverPubkey, orgKeys);

  await auditLog(db, { actorUserId: user.id, action: 'user.login' });

  return c.json({ token, serverPubkey, orgKeys }, 200);
});

app.openapi(logoutRoute, async (c) => {
  const session = c.get('session');
  const db = c.get('db');
  await revokeSession(db, session.id);
  await auditLog(db, { actorUserId: c.get('user').id, action: 'user.logout' });
  return c.body(null, 204);
});

export const authRoutes = app;
