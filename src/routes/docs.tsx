import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Navbar } from '~/components/navbar'
import { SiteFooter } from '~/components/sitefooter'
import { getCurrentUser, type CurrentUser } from '~/lib/auth-form'
import { getChecksumsFn, type ChecksumEntry } from '~/lib/checksums-server'

export const Route = createFileRoute('/docs')({
  loader: async (): Promise<ChecksumEntry[] | null> => getChecksumsFn(),
  // Never serve a router-cached copy - re-run the loader on every visit so the
  // checksums track the latest release as closely as the 60s server cache allows.
  staleTime: 0,
  shouldReload: true,
  component: DocsPage,
})

const COMMANDS = [
  { cmd: 'shh login', body: 'Authenticate; keys are derived on your machine.' },
  { cmd: 'shh auth <token>', body: 'Authenticate a headless machine with a long-lived access token.' },
  { cmd: 'shh config', body: 'View/set the server URL - per machine, or per repo in .shh.project.' },
  { cmd: 'shh link', body: 'Pin the directory to a project & environment (interactive when bare).' },
  { cmd: 'shh pull', body: 'Fetch vars + secrets into a file (--out) or shell (--shell).' },
  { cmd: 'shh reload', body: 'Pull again, delivered the way the last pull was.' },
  { cmd: 'shh secret set KEY=VALUE', body: 'Set a secret, encrypted before it leaves your machine.' },
  { cmd: 'shh secret get <key>', body: 'Print one decrypted secret value.' },
  { cmd: 'shh secret list', body: 'List secret keys - values are never shown.' },
  { cmd: 'shh var set KEY=VALUE', body: 'Set a plaintext var.' },
  { cmd: 'shh var get <key>', body: 'Print one plaintext var value.' },
  { cmd: 'shh fork --name <new>', body: 'Fork an environment, copying its vars and secrets.' },
]

function CodeBlock({ children }: { children: React.ReactNode }) {
  return <pre className="docs-code">{children}</pre>
}

function DocsPage() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const checksums = Route.useLoaderData()

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
            Command reference and setup guide for the CLI.
          </p>
        </header>

        <section className="docs-section">
          <span className="section-kicker">00 · install</span>
          <h2 className="docs-h2">One line, any machine</h2>
          <p>
            Installs the <code>itsasecret</code> binary (and its <code>shh</code> alias) to{' '}
            <code>~/.local/bin</code> - linux and macOS, amd64 and arm64. The script verifies a
            sha256 checksum before installing - but feel free to view the checksums anyway:
          </p>
          {checksums && checksums.length > 0 ? (
            <ul className="docs-checksums">
              {checksums.map((c) => (
                <li key={c.file}>
                  <span className="docs-checksum-file">{c.file}</span>
                  <span className="docs-checksum-hash">{c.hash}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="docs-checksums-empty">
              Checksums are published with every release - they&rsquo;ll appear here once this
              server has a build to serve.
            </p>
          )}
          <CodeBlock>
            <span className="term-prompt">$ </span>
            <span className="term-cmd">curl -fsSL https://itsasecret.dev/install.sh | sh</span>
          </CodeBlock>
          <p>
            Prefer to read it first? The same URL prints the script in your terminal.{' '}
            <code>SHH_INSTALL_DIR</code> overrides the destination, and{' '}
            <code>SHH_BASE_URL</code> downloads from a self-hosted server instead.
          </p>

          <h3 className="docs-h3">Nix and NixOS</h3>
          <p>
            The{' '}
            <a href="https://github.com/rockydotsystems/itsasecret-client">client repo</a> is a
            flake. It builds the CLI from source and provides both the <code>itsasecret</code>{' '}
            binary and its <code>shh</code> alias - linux and macOS, amd64 and arm64. Add it as an
            input and pull the package into <code>environment.systemPackages</code> (NixOS) or{' '}
            <code>home.packages</code> (home-manager):
          </p>
          <CodeBlock>{`# flake.nix
{
  inputs.itsasecret.url = "github:rockydotsystems/itsasecret-client";

  # then, in your NixOS or home-manager module:
  #   environment.systemPackages =
  #     [ inputs.itsasecret.packages.\${pkgs.system}.default ];
  #
  #   home.packages =
  #     [ inputs.itsasecret.packages.\${pkgs.system}.default ];
}`}</CodeBlock>
        </section>

        <section className="docs-section">
          <span className="section-kicker">01 · log in</span>
          <h2 className="docs-h2">Authenticate once per machine</h2>
          <p>
            Your master password derives your key (argon2id) and unwraps your orgs&rsquo; keys.
            Sessions roll: every command refreshes them, and after ~30 idle minutes the next
            command simply asks for your master password again. For more information, visit{' '}
            <a href="/how-it-works">how it works</a>.
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh login</span>{'\n'}
            <span className="term-dim">Email:    you@example.com{'\n'}Password: ********{'\n'}</span>
            Logged in.
          </CodeBlock>
          <p>
            By default the CLI talks to itsasecret.dev - self-hosting or developing locally, point
            it at your server first with <code>shh config</code> (section 07).
          </p>
          <p>
            Headless machine (CI runner, server, container)? Skip the password entirely: create a
            long-lived access token under <strong>Tokens</strong> in the dashboard, then
            authenticate with it. Token sessions don&rsquo;t roll or idle out - they last until the
            expiry you picked (30 days up to 2 years, or never) or until you revoke them.
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh auth shht_...</span>{'\n'}
            Authenticated to https://itsasecret.dev as you@example.com (token, does not expire).
          </CodeBlock>
        </section>

        <section className="docs-section">
          <span className="section-kicker">02 · link</span>
          <h2 className="docs-h2">Pin a directory to a project</h2>
          <p>
            Run <code>shh link</code> bare while logged in and pick your org, project, and
            environment from a menu - no IDs to copy around.
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
            <span className="term-dim">{'  skip - don’t pin an environment\n'}</span>
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
            the current directory - link the repo root once and it works in every subdirectory.
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
            Values are set one at a time - there is deliberately no bulk push. Secrets encrypt on
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
            prints them to stdout instead - perfect for direnv, no file written.
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span><span className="term-cmd">shh pull</span>{'\n'}
            Wrote .env{'\n'}
            {'\n'}
            <span className="term-dim"># .envrc (direnv) or bash/zsh</span>{'\n'}
            eval &quot;$(<span className="term-cmd">shh pull</span> --shell)&quot;{'\n'}
            <span className="term-dim"># fish</span>{'\n'}
            eval (<span className="term-cmd">shh pull</span> --shell){'\n'}
            <span className="term-dim"># nushell</span>{'\n'}
            load-env (<span className="term-cmd">shh pull</span> --shell | from json)
          </CodeBlock>
          <p>
            <code>--shell</code> speaks your shell&rsquo;s dialect: it auto-detects from{' '}
            <code>$SHELL</code> (POSIX inside direnv, where <code>.envrc</code> is always bash),
            or force one with <code>--shell=posix|fish|nu|pwsh</code>.
          </p>
        </section>

        <section className="docs-section">
          <span className="section-kicker">05 · reload</span>
          <h2 className="docs-h2">Pull again, the same way</h2>
          <p>
            After the environment changes - a teammate rotated a key, a new var landed - you
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
            same place from anywhere in the tree. It always targets the linked scope - the project
            from <code>.shh.project</code> and the environment your last <code>shh link</code>{' '}
            pinned in <code>.shh.env</code> - and one-off <code>--project</code>/<code>--env</code>{' '}
            pulls don&rsquo;t change what it repeats.
          </p>
        </section>

        <section className="docs-section">
          <span className="section-kicker">06 · fork</span>
          <h2 className="docs-h2">Branch an environment</h2>
          <p>
            Fork <code>production</code> into <code>staging</code>, or staging into a per-developer
            environment - vars and secrets are copied, then diverge freely.
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
            Set the URL once per machine - bare <code>shh config</code> opens an interactive menu,
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
            Sessions are stored per server - logging in to your self-hosted instance doesn&rsquo;t
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

      <SiteFooter />
    </>
  )
}
