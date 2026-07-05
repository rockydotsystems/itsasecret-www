import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '~/components/button'
import { Badge } from '~/components/badge'
import { Navbar } from '~/components/navbar'
import { SecretRow } from '~/components/secretrow'
import { EnvironmentTag } from '~/components/environmenttag'
import { InstallSnippet } from '~/components/installsnippet'
import { getCurrentUser, type CurrentUser } from '~/lib/auth-form'

const FEATURES = [
  {
    title: 'Encrypted end to end',
    body: 'Every value is encrypted on your machine before it ever leaves it — by the CLI or right in your browser. itsasecret.dev never sees a plaintext secret.',
    tag: 'security',
  },
  {
    title: 'Environment-aware',
    body: 'production, staging, preview-pr-42 — each environment is its own keychain, enabled per-secret.',
    tag: 'environments',
  },
  {
    title: 'One command sync',
    body: 'shh secret set encrypts and syncs in one shot. shh pull decrypts straight into your .env — or into your shell via direnv, no file written.',
    tag: 'cli',
  },
  {
    title: 'Built for teams',
    body: 'Invite teammates, scope roles, require approval before a secret reaches production.',
    tag: 'access',
  },
]

const STEPS = [
  {
    num: '01',
    cmd: 'shh link',
    body: 'Pin this repo to a project and environment — pick them from an interactive menu. Your master key is derived from your password, on your machine, and stays there.',
  },
  {
    num: '02',
    cmd: 'shh secret set',
    body: 'Each value encrypts on your machine, then syncs — the server receives ciphertext and nothing else. Plaintext config takes the same trip via shh var set.',
  },
  {
    num: '03',
    cmd: 'shh pull',
    body: 'Any machine, any teammate with access — decrypts straight into .env. Or shh pull --shell in your .envrc, and direnv allow loads them without writing a file. shh reload repeats the last pull, delivered the same way.',
  },
]

const ASSURANCES = [
  {
    term: 'argon2id',
    body: 'Your master key is derived on-device from your password. The server stores a separate login hash that cannot recover it.',
  },
  {
    term: 'envelope encryption',
    body: 'Each value is wrapped by an org key that only your master key unwraps. One secret, one envelope.',
  },
  {
    term: 'ciphertext at rest',
    body: 'The server stores encrypted blobs and re-encrypts them with an ephemeral session key for transport. No plaintext, at rest or in flight.',
  },
]

const DEMO_SECRETS = [
  { name: 'STRIPE_SECRET_KEY', value: 'sk_live_4eC39HqLyjWDarjtT1zdp7dc', lastSynced: '2m ago' },
  { name: 'DATABASE_URL', value: 'postgres://app:s3cr3t@db.internal:5432/acme', lastSynced: '2m ago' },
  { name: 'WEBHOOK_SIGNING_SECRET', value: 'whsec_8f3b1c9a2d4e6f7a0b1c2d3e4f5a6b7c', lastSynced: '1h ago' },
]

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function Terminal() {
  return (
    <div className="hero-terminal">
      <div className="hero-terminal-bar">
        <span className="hero-terminal-dot" />
        <span className="hero-terminal-dot" />
        <span className="hero-terminal-dot" />
      </div>
      <div className="hero-terminal-body">
        <div className="term-line">
          <span className="term-prompt">$ </span>
          <span className="term-cmd">shh secret set</span>
          {' STRIPE_SECRET_KEY=sk_live_4eC39…'}
        </div>
        <div className="term-line term-dim">
          {'  encrypted on this machine · production '}
          <span className="term-ok">✓</span>
          {' staging '}
          <span className="term-ok">✓</span>
          {' preview-pr-42 '}
          <span className="term-ok">✓</span>
        </div>
        <div className="term-line">
          <span className="term-prompt">$ </span>
          <span className="term-cmd">shh var set</span>
          {' NODE_ENV=production'}
        </div>
        <div className="term-line term-dim">
          {'  plaintext var · synced '}
          <span className="term-ok">✓</span>
        </div>
        <div className="term-line">&nbsp;</div>
        <div className="term-line">
          <span className="term-prompt">$ </span>
          <span className="term-cmd">shh pull</span>
        </div>
        <div className="term-line term-dim">
          {'  .env updated — 12 values, decrypted '}
          <span className="term-flare">on this machine only</span>
        </div>
        <div className="term-line">&nbsp;</div>
        <div className="term-line">
          <span className="term-prompt">$ </span>
          <span className="term-cmd">direnv allow</span>
          <span className="term-dim">   # .envrc: eval "$(shh pull --shell)"</span>
        </div>
        <div className="term-line term-dim">  direnv: export +DATABASE_URL +STRIPE_SECRET_KEY +10 more</div>
      </div>
    </div>
  )
}

function LandingPage() {
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    void getCurrentUser().then((u) => {
      setUser(u)
    })
  }, [])

  return (
    <>
      <Navbar loggedIn={!!user} userEmail={user?.email} />

      <section className="hero hero-texture">
        <div className="hero-inner">
          <h1 className="hero-title">
            Secrets, synced<span className="hero-title-flare">.</span>
          </h1>
          <p className="hero-subtitle">
            One encrypted source of truth for every env var, on every machine, in every environment your team ships to.
          </p>
          <div className="hero-ctas">
            {user ? (
              <Button variant="primary" size="lg" href="/dashboard">Go to dashboard</Button>
            ) : (
              <>
                <Button variant="primary" size="lg" href="/register">Get started free</Button>
                <Button variant="secondary" size="lg" href="/docs">Read the docs</Button>
              </>
            )}
          </div>
          <InstallSnippet />
          <Terminal />
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <span className="section-kicker">how it works</span>
          <h2 className="section-title">Three commands, no ceremony.</h2>
          <div className="steps">
            {STEPS.map((s) => (
              <div className="step" key={s.num}>
                <span className="step-num">{s.num}</span>
                <span className="step-cmd">
                  <span className="term-prompt">$ </span>
                  {s.cmd}
                </span>
                <p className="step-body">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="section-inner">
          <span className="section-kicker">the dashboard</span>
          <h2 className="section-title">Masked by default.</h2>
          <p className="section-lede">
            Values stay dots until you deliberately reveal one — and the orange flare means something sensitive is exposed right now.
            Set values here too: the web client encrypts in your browser, the same envelope the CLI writes.
          </p>
          <div className="vault-preview">
            <div className="vault-envs">
              <EnvironmentTag name="production" active />
              <EnvironmentTag name="staging" />
              <EnvironmentTag name="preview-pr-42" />
            </div>
            {DEMO_SECRETS.map((s) => (
              <SecretRow key={s.name} name={s.name} value={s.value} meta={`synced ${s.lastSynced}`} />
            ))}
            <div className="vault-caption">12 secrets · synced to 3 machines · 3 environments</div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <span className="section-kicker">what you get</span>
          <h2 className="section-title">Everything env vars need. Nothing else.</h2>
          <div className="feature-grid-inner">
            {FEATURES.map((f) => (
              <div className="feature-card" key={f.tag}>
                <Badge variant="signal">{f.tag}</Badge>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="section-inner">
          <span className="section-kicker">the crypto</span>
          <h2 className="section-title">Your master password never leaves your machine.</h2>
          <div className="assurances">
            {ASSURANCES.map((a) => (
              <div className="assurance" key={a.term}>
                <span className="assurance-term">{a.term}</span>
                <p className="assurance-body">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-final hero-texture">
        <div className="hero-inner">
          <h2 className="cta-final-title">Stop pasting .env files into Slack.</h2>
          <div className="hero-ctas">
            {user ? (
              <Button variant="primary" size="lg" href="/dashboard">Go to dashboard</Button>
            ) : (
              <>
                <Button variant="primary" size="lg" href="/register">Get started free</Button>
                <Button variant="secondary" size="lg" href="/docs">Read the docs</Button>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>itsasecret.dev &middot; shh secret set. shh pull. done.</span>
          <span className="site-footer-links">
            <a href="/docs">docs</a>
            <a href="/how-it-works">how it works</a>
            <a href="/login">log in</a>
            <a href="/register">register</a>
          </span>
        </div>
      </footer>
    </>
  )
}
