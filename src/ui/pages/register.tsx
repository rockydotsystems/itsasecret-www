import { Layout } from '../layout';
import { Button } from '../components/button';
import { Input } from '../components/input';
import { LogoMark } from '../components/logo';
import { AUTH_SCRIPT } from '../scripts/auth';

export const RegisterPage = () => (
  <Layout title="itsasecret — Create account">
    <div class="auth-page">
      <div class="card auth-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px">
          <LogoMark size={28} />
          <span style="font:600 var(--text-xl)/var(--leading-snug) var(--font-family-display);color:var(--text-primary)">itsasecret</span>
        </div>
        <h1 class="auth-title">Create your account</h1>
        <p class="auth-subtitle">Your master password encrypts your secrets. We can't recover it for you.</p>

        <form id="auth-form" data-auth-action="/api/auth/register" style="display:flex;flex-direction:column;gap:20px">
          <Input name="email" type="email" label="Email" placeholder="you@example.com" required />
          <Input
            name="password"
            type="password"
            label="Master password"
            placeholder="At least 12 characters"
            helperText="This password encrypts your encryption key. Choose carefully."
            required
          />
          <Button type="submit" size="lg">Create account</Button>
        </form>

        <p class="auth-footer">
          Already have an account? <a href="/login">Log in</a>
        </p>
      </div>
    </div>
    <script dangerouslySetInnerHTML={{ __html: AUTH_SCRIPT }} />
  </Layout>
);
