import { Hono } from 'hono';
import { jsxRenderer } from 'hono/jsx-renderer';
import { Layout } from './layout';

const app = new Hono();

app.use('*', jsxRenderer(({ children }) => <Layout>{children}</Layout>));

app.get('/', (c) =>
  c.render(
    <div>
      <h1>itsasecret</h1>
      <p>Sync env vars & secrets across environments.</p>
    </div>
  )
);

export const uiRoutes = app;
