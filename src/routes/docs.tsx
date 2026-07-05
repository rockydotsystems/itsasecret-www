import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Navbar } from '~/components/navbar'
import { getCurrentUser, type CurrentUser } from '~/lib/auth-form'

export const Route = createFileRoute('/docs')({
  component: DocsPage,
})

const COMMANDS = [
  { cmd: 'shh login', body: 'Authenticate; keys are derived on your machine.' },
  { cmd: 'shh config', body: 'View/set the server URL — per machine, or per repo in .shh.project.' },
  { cmd: 'shh link', body: 'Pin the directory to a project & environment (interactive when bare).' },
  { cmd: 'shh pull', body: 'Fetch vars + secrets into a file (--out) or shell (--shell).' },
  { cmd: 'shh reload', body: 'Pull again, delivered the way the last pull was.' },
  { cmd: 'shh secret set KEY=VALUE', body: 'Set a secret, encrypted before it leaves your machine.' },
  { cmd: 'shh secret get <key>', body: 'Print one decrypted secret value.' },
  { cmd: 'shh secret list', body: 'List secret keys — values are never shown.' },
  { cmd: 'shh var set KEY=VALUE', body: 'Set a plaintext var.' },
  { cmd: 'shh var get <key>', body: 'Print one plaintext var value.' },
  { cmd: 'shh fork --name <new>', body: 'Fork an environment, copying its vars and secrets.' },
]

function CodeBlock({ children }: { children: React.ReactNode }) {
  return <pre className="docs-code">{children}</pre>
}

function DocsPage() {
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
            The <code>shh</code> CLI<span className="hero-title-flare">.</span>
          </h1>
          <p className="docs-lede">
            The binary is <code>itsasecret</code>, aliased to <code>shh</code>. Five minutes from
            login to secrets in your shell — everything encrypts on your machine before it syncs.
          </p>
        </header>

        <section className="docs-section">
          <span className="section-kicker">01 · log in</span>
          <h2 className="docs-h2">Authenticate once per machine</h2>
          <p>
            Your master password derives your key on-device (argon2id) and unwraps your orgs&rsquo;
            keys; the session is stored under <code>~/.config/itsasecret/</code>.
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh login</span>{'\n'}
            <span className="term-dim">Email:    you@example.com{'\n'}Password: ********{'\n'}</span>
            Logged in.
          </CodeBlock>
          <p>
            By default the CLI talks to itsasecret.dev — self-hosting or developing locally, point
            it at your server first with <code>shh config</code> (section 07).
          </p>
        </section>

        <section className="docs-section">
          <span className="section-kicker">02 · link</span>
          <h2 className="docs-h2">Pin a directory to a project</h2>
          <p>
            Run <code>shh link</code> bare while logged in and pick your org, project, and
            environment from a menu — no IDs to copy around.
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh link</span>{'\n'}
            Select a project{'\n'}
            <span className="term-flare">&gt; www</span> <span className="term-dim">(gh6p5a84k3xvv8mdjlkrou7x)</span>{'\n'}
            {'  client '}<span className="term-dim">(m2k9d0q1x7v5p8n4j6r3t1wz)</span>{'\n'}
            {'\n'}
            Select an environment{'\n'}
            <span className="term-flare">&gt; production</span>{'\n'}
            {'  staging\n'}
            <span className="term-dim">{'  skip — don’t pin an environment\n'}</span>
            {'\n'}
            Linked project gh6p5a84… → .shh.project <span className="term-dim">(commit this file)</span>{'\n'}
            Linked environment production → .shh.env <span className="term-dim">(local only)</span>{'\n'}
            Added .shh.env to .gitignore <span className="term-ok">✓</span>
          </CodeBlock>
          <p>
            That writes two files: <code>.shh.project</code> holds the project ID and is meant to
            be committed, so the whole team is linked after <code>git pull</code>.{' '}
            <code>.shh.env</code> holds <em>your</em> environment choice, stays local, and is added
            to <code>.gitignore</code> automatically. Every command finds them by walking up from
            the current directory — link the repo root once and it works in every subdirectory.
            Flags always win over files, and with no environment pinned, commands default to{' '}
            <code>production</code>.
          </p>
          <p>Prefer flags? The non-interactive form does the same thing:</p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh link</span> --project gh6p5a84k3xvv8mdjlkrou7x --env staging
          </CodeBlock>
        </section>

        <section className="docs-section">
          <span className="section-kicker">03 · set values</span>
          <h2 className="docs-h2">Secrets encrypt, vars don&rsquo;t</h2>
          <p>
            Values are set one at a time — there is deliberately no bulk push. Secrets encrypt on
            your machine before they sync; plaintext config goes through <code>var</code>.
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh secret set</span> STRIPE_SECRET_KEY=sk_live_4eC39…{'\n'}
            <span className="term-prompt">$ </span><span className="term-cmd">shh var set</span> NODE_ENV=production{'\n'}
            <span className="term-prompt">$ </span><span className="term-cmd">shh secret get</span> STRIPE_SECRET_KEY{'\n'}
            <span className="term-prompt">$ </span><span className="term-cmd">shh secret list</span>
          </CodeBlock>
        </section>

        <section className="docs-section">
          <span className="section-kicker">04 · pull</span>
          <h2 className="docs-h2">Decrypt into a file or your shell</h2>
          <p>
            <code>shh pull</code> writes sourceable <code>export</code> lines to{' '}
            <code>.env</code> (or <code>--out &lt;path&gt;</code>). With <code>--shell</code> it
            prints them to stdout instead — perfect for direnv, no file written.
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh pull</span>{'\n'}
            Wrote .env{'\n'}
            {'\n'}
            <span className="term-dim"># .envrc</span>{'\n'}
            eval &quot;$(<span className="term-cmd">shh pull</span> --shell)&quot;
          </CodeBlock>
        </section>

        <section className="docs-section">
          <span className="section-kicker">05 · reload</span>
          <h2 className="docs-h2">Pull again, the same way</h2>
          <p>
            After the environment changes — a teammate rotated a key, a new var landed — you
            don&rsquo;t need to remember how this repo consumes its values.{' '}
            <code>shh reload</code> pulls the linked project and environment again and delivers
            them exactly the way the last pull here did: rewriting the same file, or re-emitting
            shell exports.
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh reload</span>{'\n'}
            Wrote .env{'\n'}
            {'\n'}
            <span className="term-dim"># when the last pull was --shell:</span>{'\n'}
            eval &quot;$(<span className="term-cmd">shh reload</span>)&quot;
          </CodeBlock>
          <p>
            The delivery is recorded in <code>.shh.project</code> (<code>pull = shell</code> or{' '}
            <code>pull = file:&lt;path&gt;</code>, relative to that file), so reload writes to the
            same place from anywhere in the tree. It always targets the linked scope — the project
            from <code>.shh.project</code> and the environment your last <code>shh link</code>{' '}
            pinned in <code>.shh.env</code> — and one-off <code>--project</code>/<code>--env</code>{' '}
            pulls don&rsquo;t change what it repeats.
          </p>
        </section>

        <section className="docs-section">
          <span className="section-kicker">06 · fork</span>
          <h2 className="docs-h2">Branch an environment</h2>
          <p>
            Fork <code>production</code> into <code>staging</code>, or staging into a per-developer
            environment — vars and secrets are copied, then diverge freely.
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh fork</span> --name staging{'\n'}
            Forked gh6p5a84…/production → staging
          </CodeBlock>
        </section>

        <section className="docs-section">
          <span className="section-kicker">07 · config</span>
          <h2 className="docs-h2">Point the CLI at your server</h2>
          <p>
            Nothing to do if you use itsasecret.dev. Self-hosting, or running the server locally?
            Set the URL once per machine — bare <code>shh config</code> opens an interactive menu,
            or set it directly:
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh config set url</span> https://secrets.corp.example{'\n'}
            Server URL set to https://secrets.corp.example for this machine.{'\n'}
            <span className="term-dim">Run `shh login` if you haven&rsquo;t authenticated against it yet.</span>{'\n'}
            {'\n'}
            <span className="term-prompt">$ </span><span className="term-cmd">shh config get url</span>{'\n'}
            https://secrets.corp.example <span className="term-dim">(this machine&rsquo;s global config)</span>
          </CodeBlock>
          <p>
            A repo can instead carry its server with it: <code>shh config set url &lt;url&gt;
            --project</code> (or picking &ldquo;this project&rdquo; in the menu) writes a{' '}
            <code>url =</code> line into <code>.shh.project</code>, committed alongside the project
            ID, so every clone points at the right server. The project line wins over the machine
            config, and <code>shh config get url</code> tells you which one is in effect.
          </p>
          <p>
            Sessions are stored per server — logging in to your self-hosted instance doesn&rsquo;t
            log you out of itsasecret.dev, and switching between repos just works.
          </p>
        </section>

        <section className="docs-section">
          <span className="section-kicker">reference</span>
          <h2 className="docs-h2">Every command</h2>
          <p>
            All environment-scoped commands accept <code>--project &lt;id&gt;</code> and{' '}
            <code>--env &lt;name&gt;</code> to override the linked scope.
          </p>
          <div className="docs-table">
            {COMMANDS.map((c) => (
              <div className="docs-table-row" key={c.cmd}>
                <code className="docs-table-cmd">{c.cmd}</code>
                <span className="docs-table-body">{c.body}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>itsasecret.dev &middot; shh secret set. shh pull. done.</span>
          <span className="site-footer-links">
            <a href="/docs">docs</a>
            <a href="/login">log in</a>
            <a href="/register">register</a>
          </span>
        </div>
      </footer>
    </>
  )
}
