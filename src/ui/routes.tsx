import { Hono } from 'hono';
import { LandingPage } from './pages/landing';
import { LoginPage } from './pages/login';
import { RegisterPage } from './pages/register';
import { DashboardPage } from './pages/dashboard';

const app = new Hono();

app.get('/', (c) => c.html(<LandingPage />));
app.get('/login', (c) => c.html(<LoginPage />));
app.get('/register', (c) => c.html(<RegisterPage />));
app.get('/dashboard', (c) => c.html(<DashboardPage />));

export const uiRoutes = app;
