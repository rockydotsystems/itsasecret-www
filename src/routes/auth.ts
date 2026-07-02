import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { createRoute } from '@hono/zod-openapi';

const app = new OpenAPIHono();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

const registerRoute = createRoute({
  method: 'post',
  path: '/auth/register',
  request: {
    body: { content: { 'application/json': { schema: registerSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: z.object({ userId: z.string() }) } },
      description: 'Account created',
    },
  },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  // client ECDH ephemeral public key (base64)
  clientPubkey: z.string(),
});

const loginResponseSchema = z.object({
  token: z.string(),
  // server ECDH ephemeral public key (base64) for session key derivation
  serverPubkey: z.string(),
  // org shared keys, encrypted with the session key (base64)
  orgKeys: z.record(z.string(), z.string()),
});

const loginRoute = createRoute({
  method: 'post',
  path: '/auth/login',
  request: {
    body: { content: { 'application/json': { schema: loginSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: loginResponseSchema } },
      description: 'Session created',
    },
    401: { description: 'Invalid credentials' },
  },
});

app.openapi(registerRoute, async (c) => {
  void c.req.valid('json');
  // TODO: KDF + create user + personal org
  return c.json({ userId: 'TODO' }, 201);
});

app.openapi(loginRoute, async (c) => {
  void c.req.valid('json');
  // TODO: verify password, ECDH key exchange, create session in D1
  return c.json({ token: 'TODO', serverPubkey: 'TODO', orgKeys: {} });
});

export const authRoutes = app;
