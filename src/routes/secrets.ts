import { OpenAPIHono } from '@hono/zod-openapi';
const app = new OpenAPIHono();
// TODO: secret CRUD routes (encrypt/decrypt)
export const secretRoutes = app;
