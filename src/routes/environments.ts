import { OpenAPIHono } from '@hono/zod-openapi';
const app = new OpenAPIHono();
// TODO: environment CRUD + fork routes
export const envRoutes = app;
