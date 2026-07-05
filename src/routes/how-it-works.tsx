import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Navbar } from '~/components/navbar'
import { getCurrentUser, type CurrentUser } from '~/lib/auth-form'

export const Route = createFileRoute('/how-it-works')({
  component: HowItWorksPage,
})

function CodeBlock({ children }: { children: React.ReactNode }) {
  return <pre className="docs-code">{children}</pre>
}

function HowItWorksPage() {
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    void getCurrentUser().then((u) => {
      setUser(u)
    })
  }, [])

  return (
    <>
      <Navbar loggedIn={!!user} userEmail={user?.email} />

      <main className="docs-main">
        <header className="docs-header">
          <h1 className="docs-title">
            How it works<span className="hero-title-flare">.</span>
          </h1>
          <p className="docs-lede">
            The security model in plain terms: what your master password protects, how sessions
            behave, and exactly what ends up on your disk.
          </p>
        </header>

        <section className="docs-section">
          <span className="section-kicker">01 · the master password</span>
          <h2 className="docs-h2">One password unlocks everything</h2>
          <p>
            Your master password feeds an argon2id key derivation. The derived key wraps your
            orgs&rsquo; keys; the server stores only a separate login hash (which cannot recover
            the key) and the wrapped blobs. Nothing at rest - on the server or on your machines -
            is readable without the master password.
          </p>
        </section>

        <section className="docs-section">
          <span className="section-kicker">02 · org keys</span>
          <h2 className="docs-h2">One envelope per org, one wrap per member</h2>
          <p>
            Every org has a shared key that encrypts its secrets. Each member holds that org key
            wrapped under their own master-password-derived key. Invite someone and the org key is
            re-wrapped for them the first time they log in - so joining an org never requires
            anyone to hand around plaintext keys.
          </p>
        </section>

        <section className="docs-section">
          <span className="section-kicker">03 · sessions</span>
          <h2 className="docs-h2">Rolling sessions: type your password when idle, not constantly</h2>
          <p>
            Logging in from the CLI starts a <em>rolling session</em>, valid for 30 minutes. Every
            successful command refreshes it - and hands the CLI a brand-new session token, with
            the old one dying moments later. While you&rsquo;re actively working you never see a
            prompt; a token stolen in flight goes stale almost immediately.
          </p>
          <p>
            Go idle for more than 30 minutes and the next command simply asks again:
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh pull</span>{'\n'}
            Session for https://itsasecret.dev expired - enter your master password to unlock.{'\n'}
            Master password (you@example.com) <span className="term-dim">********</span>{'\n'}
            Unlocked https://itsasecret.dev.{'\n'}
            Wrote .env
          </CodeBlock>
          <p>
            That unlock is a full re-authentication, so it also refreshes your org keys - join a
            new org and it shows up by your next unlock at the latest. Sessions are kept{' '}
            <em>per server</em>: your itsasecret.dev login and a self-hosted server&rsquo;s login
            coexist, each rolling independently. The prompt talks to your terminal directly
            (sudo-style), so it works even where output is captured - direnv loading your{' '}
            <code>.envrc</code>, or <code>eval &quot;$(shh pull --shell)&quot;</code> - without a
            stray character reaching the shell. Only a genuinely headless run (CI, no terminal)
            fails, with a clear message.
          </p>
        </section>

        <section className="docs-section">
          <span className="section-kicker">04 · on your disk</span>
          <h2 className="docs-h2">Nothing long-lived is stored in plaintext</h2>
          <p>
            The CLI keeps one config file (<code>~/.config/itsasecret/config.json</code>, mode
            0600). Per server it holds: the current rolling token and its expiry, your account
            email, the session&rsquo;s transport key, and your org keys{' '}
            <strong>wrapped under your master password</strong> - never unwrapped. If the file
            leaks, the wrapped keys are useless without your password, and the token + transport
            key expire within 30 minutes of your last command.
          </p>
          <p>
            The repo-level files hold no secrets at all: <code>.shh.project</code> is a project
            ID, a server URL, and a pull preference; <code>.shh.env</code> is an environment name.
          </p>
        </section>

        <section className="docs-section">
          <span className="section-kicker">05 · in flight & at rest</span>
          <h2 className="docs-h2">Ciphertext on the wire, ciphertext in the database</h2>
          <p>
            Each session negotiates an ephemeral ECDH transport key. Secrets travel encrypted
            under it and are stored re-encrypted under the org key - the database holds only
            ciphertext. Even the session&rsquo;s own org-key material is stored encrypted under a
            key the server does not persist: the client supplies it per request, so a stolen
            database dump cannot decrypt anything on its own.
          </p>
        </section>
      </main>

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
