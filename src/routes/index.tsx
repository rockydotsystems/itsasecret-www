import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '~/components/button'
import { Badge } from '~/components/badge'
import { Navbar } from '~/components/navbar'
import { InstallSnippet } from '~/components/installsnippet'
import { getCurrentUser, type CurrentUser } from '~/lib/auth-form'
import {
  IconBookBookmark,
  IconCircleKey,
  IconEyeClosed,
  IconHouse2,
  IconLock,
  IconRocket,
  IconStar,
  IconUserLaptop,
} from 'nucleo-pixel-essential'

const FEATURES = [
  {
    title: 'Encrypted end to end',
    body: 'Every value is encrypted on your machine before it ever leaves it - by the CLI or right in your browser. itsasecret.dev never sees a plaintext secret.',
    tag: 'security',
  },
  {
    title: 'Environment-aware',
    body: 'production, staging, preview-pr-42 - each environment is its own keychain, enabled per-secret.',
    tag: 'environments',
  },
  {
    title: 'One command sync',
    body: 'shh secret set encrypts and syncs in one shot. shh pull decrypts straight into your .env - or into your shell directly.',
    tag: 'cli',
  },
  {
    title: 'Built for teams',
    body: 'Invite teammates, scope roles, require approval before a secret reaches production.',
    tag: 'access',
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
  {
    term: 'inviting teammates',
    body: 'An invite is an email link, never a shared password. When the new member logs in, the org key is wrapped under their own master key - each member holds their own sealed copy, and removing a member removes theirs.',
  },
]

const SHELL_FEATURES = [
  {
    cmd: 'shh pull --shell',
    body: 'Works with every shell - POSIX exports for bash and zsh, set -gx for fish, JSON for nushell\'s load-env, $env: for PowerShell. The dialect is picked from $SHELL automatically.',
  },
  {
    cmd: 'direnv allow',
    body: 'First-class direnv support: put eval "$(shh pull --shell)" in .envrc and secrets load the moment you enter the directory - straight into the shell, no file written.',
  },
  {
    cmd: 'shh completion',
    body: 'Autocompletion for every command and flag - one command generates the completion script for bash, zsh, fish, or PowerShell.',
  },
]

const ZK_ROWS = [
  { name: 'STRIPE_SECRET_KEY', plain: 'sk_live_4eC39HqLyjWD…', cipher: 'nQ7xKf3PZw8VtJqA9c2…' },
  { name: 'DATABASE_URL', plain: 'postgres://app:s3cr3t@…', cipher: 'Um4dR0yLx6HgTb1sWe8…' },
  { name: 'WEBHOOK_SIGNING_SECRET', plain: 'whsec_8f3b1c9a2d4e…', cipher: 'c5JpNv2EiA7kYq0zXm4…' },
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
          <span className="term-cmd">shh login</span>
        </div>
        <div className="term-line term-dim">  Logging in to https://itsasecret.dev</div>
        <div className="term-line term-dim">  Email: dana@acme.dev</div>
        <div className="term-line term-dim">  Master password (dana@acme.dev): ············</div>
        <div className="term-line term-dim">
          {'  '}
          <span className="term-ok">Logged in.</span>
        </div>
        <div className="term-line">&nbsp;</div>
        <div className="term-line">
          <span className="term-prompt">$ </span>
          <span className="term-cmd">shh link</span>
        </div>
        <div className="term-line term-dim">  Org: acme</div>
        <div className="term-line term-dim">  Select a project: api</div>
        <div className="term-line term-dim">  Linked project pzc4hakwv0947p3v2yc0rrym → .shh.project (commit this file)</div>
        <div className="term-line term-dim">  Select an environment: production</div>
        <div className="term-line term-dim">  Linked environment production → .shh.env (local only)</div>
        <div className="term-line">&nbsp;</div>
        <div className="term-line">
          <span className="term-prompt">$ </span>
          <span className="term-cmd">shh pull</span>
          <span className="term-dim">   # decrypts </span>
          <span className="term-flare">on this machine only</span>
        </div>
        <div className="term-line term-dim">  Wrote .env</div>
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

function ZeroKnowledgeDiagram() {
  return (
    <div className="zk-diagram">
      <div className="zk-node">
        <div className="zk-node-head">
          <IconUserLaptop size={14} aria-hidden="true" />
          your machine
        </div>
        {ZK_ROWS.map((r) => (
          <div className="zk-row" key={r.name}>
            <span className="zk-name">{r.name}</span>
            <span className="zk-value zk-plain">{r.plain}</span>
          </div>
        ))}
        <div className="zk-foot zk-foot-key">
          <IconCircleKey size={14} aria-hidden="true" />
          <span>the master key lives here - derived from your password, it never leaves</span>
        </div>
      </div>
      <div className="zk-wire" aria-hidden="true">
        <span className="zk-hop">leaves encrypted →</span>
        <span className="zk-hop">← returns encrypted</span>
      </div>
      <div className="zk-node">
        <div className="zk-node-head">
          <IconLock size={14} aria-hidden="true" />
          our database
        </div>
        {ZK_ROWS.map((r) => (
          <div className="zk-row" key={r.name}>
            <span className="zk-name">{r.name}</span>
            <span className="zk-value zk-cipher">{r.cipher}</span>
          </div>
        ))}
        <div className="zk-foot">
          <IconEyeClosed size={14} aria-hidden="true" />
          <span>no keys on our side - we couldn't read these if we tried</span>
        </div>
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
            Secrets made simple securely<span className="hero-title-flare">.</span>
          </h1>
          <p className="hero-subtitle">
            One encrypted source of truth for every env var, on every machine, in every environment your team ships to
            and develops on.
          </p>
          <div className="hero-ctas">
            {user ? (
              <Button variant="primary" size="lg" href="/dashboard">
                <IconHouse2 size={16} aria-hidden="true" />
                Go to dashboard
              </Button>
            ) : (
              <>
                <Button variant="primary" size="lg" href="/register">
                  Get started
                  <IconRocket size={16} aria-hidden="true" />
                </Button>
                <Button variant="secondary" size="lg" href="/docs">
                  <IconBookBookmark size={16} aria-hidden="true" />
                  Read the docs
                </Button>
              </>
            )}
          </div>
          <InstallSnippet />
          <Terminal />
        </div>
      </section>

      <section className="section section-alt">
        <div className="section-inner">
          <span className="section-kicker">zero knowledge</span>
          <h2 className="section-title">We store your secrets. We can't read them.</h2>
          <p className="section-lede">
            Every value is encrypted on your machine before it syncs, with a key derived from your master password.
            What lands in our database is ciphertext we cannot open - the keys exist in exactly one place: with you
            and the teammates you invite.
          </p>
          <ZeroKnowledgeDiagram />
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

      <section className="section">
        <div className="section-inner">
          <span className="section-kicker">your shell</span>
          <h2 className="section-title">At home in every shell.</h2>
          <div className="steps">
            {SHELL_FEATURES.map((s) => (
              <div className="step" key={s.cmd}>
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

      <section className="cta-final hero-texture">
        <div className="hero-inner">
          <h2 className="cta-final-title">Stop pasting .env files into Slack.</h2>
          <div className="hero-ctas">
            {user ? (
              <Button variant="primary" size="lg" href="/dashboard">
                <IconHouse2 size={16} aria-hidden="true" />
                Go to dashboard
              </Button>
            ) : (
              <>
                <Button variant="primary" size="lg" href="/register">
                  Get started
                  <IconRocket size={16} aria-hidden="true" />
                </Button>
                <Button variant="secondary" size="lg" href="/docs">
                  <IconBookBookmark size={16} aria-hidden="true" />
                  Read the docs
                </Button>
              </>
            )}
            <Button variant="secondary" size="lg" href="https://github.com/rockydotsystems">
              <IconStar size={16} aria-hidden="true" />
              Star us on GitHub
            </Button>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>
            itsasecret.dev &middot; a product by <a href="https://rocky.systems">rocky.systems</a>
          </span>
          <span className="site-footer-links">
            <a href="/docs">docs</a>
            <a href="/how-it-works">how it works</a>
            <a href="https://github.com/rockydotsystems">github</a>
            <a href="/login">log in</a>
            <a href="/register">register</a>
          </span>
        </div>
      </footer>
    </>
  )
}
