import { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';
import { healthRoute } from './routes/health';
import { authRoutes } from './routes/auth';
import { orgRoutes } from './routes/orgs';
import { projectRoutes } from './routes/projects';
import { envRoutes } from './routes/environments';
import { varRoutes } from './routes/vars';
import { secretRoutes } from './routes/secrets';
import { uiRoutes } from './ui/routes';

const app = new OpenAPIHono();

app.openapi(healthRoute, (c) => c.json({ status: 'ok' }));

app.route('/api', authRoutes);
app.route('/api', orgRoutes);
app.route('/api', projectRoutes);
app.route('/api', envRoutes);
app.route('/api', varRoutes);
app.route('/api', secretRoutes);

app.doc('/api/doc', {
  openapi: '3.0.0',
  info: {
    title: 'itsasecret API',
    version: '0.1.0',
  },
});

app.get('/api/reference', apiReference({ url: '/api/doc', theme: 'purple' }));

app.route('/', uiRoutes);

export { app };
