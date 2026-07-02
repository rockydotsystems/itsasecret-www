import { Layout } from '../layout';
import { Button } from '../components/button';
import { Badge } from '../components/badge';
import { LogoMark } from '../components/logo';

const FEATURES = [
  {
    title: 'Encrypted end to end',
    body: 'Every value is encrypted on your machine before it ever leaves it. itsasecret.dev never sees a plaintext secret.',
    tag: 'security',
  },
  {
    title: 'Environment-aware',
    body: 'production, staging, preview-branch-42 — each environment is its own keychain, enabled per-secret.',
    tag: 'environments',
  },
  {
    title: 'One command sync',
    body: 'shh push encrypts and syncs in one shot. shh pull decrypts straight into your .env, every machine, every time.',
    tag: 'cli',
  },
  {
    title: 'Built for teams',
    body: 'Invite teammates, scope roles, require approval before a secret reaches production.',
    tag: 'access',
  },
];

export const LandingPage = () => (
  <Layout title="itsasecret — Secrets, synced.">
    <section class="hero redaction-bg">
      <div style="position:relative;max-width:720px;margin:0 auto">
        <div class="hero-badge">
          <LogoMark size={14} />
          cli alias: shh
        </div>
        <h1 class="hero-title">Secrets, synced.</h1>
        <p class="hero-subtitle">
          One encrypted source of truth for every env var, on every machine, in every environment your team ships to.
        </p>
        <div class="hero-ctas">
          <Button variant="primary" size="lg" href="/register">Get started free</Button>
          <Button variant="secondary" size="lg" href="/docs">Read the docs</Button>
        </div>
      </div>
    </section>

    <section class="feature-grid">
      <div class="feature-grid-inner">
        {FEATURES.map((f) => (
          <div class="feature-card">
            <Badge variant="signal">{f.tag}</Badge>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </section>

    <footer class="site-footer">itsasecret.dev &middot; shh push. shh pull. done.</footer>
  </Layout>
);
