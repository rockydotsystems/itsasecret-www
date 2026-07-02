import { createFileRoute } from '@tanstack/react-router'
import { Button } from '~/components/button'
import { Badge } from '~/components/badge'
import { LogoMark } from '~/components/logo'
import { Navbar } from '~/components/navbar'

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
]

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <>
      <Navbar />
      <section className="hero">
        <div style={{ position: 'relative', maxWidth: '720px', margin: '0 auto' }}>
          <div className="hero-badge">
            <LogoMark size={14} />
            cli alias: shh
          </div>
          <h1 className="hero-title">Secrets, synced.</h1>
          <p className="hero-subtitle">
            One encrypted source of truth for every env var, on every machine, in every environment your team ships to.
          </p>
          <div className="hero-ctas">
            <Button variant="primary" size="lg" href="/register">Get started free</Button>
            <Button variant="secondary" size="lg" href="/docs">Read the docs</Button>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        <div className="feature-grid-inner">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.tag}>
              <Badge variant="signal">{f.tag}</Badge>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="site-footer">itsasecret.dev &middot; shh push. shh pull. done.</footer>
    </>
  )
}
