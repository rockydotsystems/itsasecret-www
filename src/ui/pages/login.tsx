import { Layout } from '../layout';
import { Button } from '../components/button';
import { Input } from '../components/input';
import { LogoMark } from '../components/logo';

export const LoginPage = () => (
  <Layout title="itsasecret — Login">
    <div class="auth-page">
      <div class="card auth-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px">
          <LogoMark size={28} />
          <span style="font:600 var(--text-xl)/var(--leading-snug) var(--font-family-display);color:var(--text-primary)">itsasecret</span>
        </div>
        <h1 class="auth-title">Welcome back</h1>
        <p class="auth-subtitle">Enter your master password to decrypt your vault.</p>

        <form method="post" action="/api/auth/login" style="display:flex;flex-direction:column;gap:20px">
          <Input name="email" type="email" label="Email" placeholder="you@example.com" required />
          <Input name="password" type="password" label="Master password" placeholder="••••••••••••" required />
          <Button type="submit" size="lg">Log in</Button>
        </form>

        <p class="auth-footer">
          No account? <a href="/register">Create one</a>
        </p>
      </div>
    </div>
  </Layout>
);
