import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Navbar } from '~/components/navbar'
import { SiteFooter } from '~/components/sitefooter'
import { getCurrentUser, type CurrentUser } from '~/lib/auth-form'

export const Route = createFileRoute('/self-hosting')({
  component: SelfHostingPage,
})

function CodeBlock({ children }: { children: React.ReactNode }) {
  return <pre className="docs-code">{children}</pre>
}

function SelfHostingPage() {
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
            Self-hosting<span className="hero-title-flare">.</span>
          </h1>
          <p className="docs-lede">
              Run the same web dashboard and HTTP API as itsasecret.dev on your own machines. Secrets
              stay end-to-end encrypted; this stack only ever stores ciphertext.
          </p>
        </header>

        <section className="docs-section">
          <div className="docs-label">01  what you run</div>
          <h2 className="docs-h2">Two containers</h2>
          <p>
            The <a href="https://hub.docker.com/r/itsasecret/web">itsasecret/web</a> image (linux
            amd64 and arm64, published from <code>main</code>) plus Postgres 17. Compose in{' '}
            <a href="https://github.com/rockydotsystems/itsasecret-www/tree/main/deploy">
              deploy/
            </a>{' '}
            wires them together: the app migrates the database on every boot, and Postgres is not
            published to the host - only the web container can reach it.
          </p>
          <p>
            The CLI is unchanged. Point it at your origin with <code>shh config set url</code> and
            every command talks to your instance instead of itsasecret.dev. Logins are stored per
            server, so a hosted account and a self-hosted one can coexist on the same machine.
          </p>
          <p>
            Run a single web replica. Migrations and the daily purge (secret/var history after 7
            days, soft-deleted rows after 90) both live inside the process.
          </p>
        </section>

        <section className="docs-section">
          <div className="docs-label">02  quickstart</div>
          <h2 className="docs-h2">Docker Compose, two secrets, up</h2>
          <p>Only Docker is required.</p>
          <CodeBlock>
            {`mkdir itsasecret && cd itsasecret
curl -O https://raw.githubusercontent.com/rockydotsystems/itsasecret-www/main/deploy/docker-compose.yml
curl -o .env.example https://raw.githubusercontent.com/rockydotsystems/itsasecret-www/main/deploy/.env.example
cp .env.example .env`}
          </CodeBlock>
          <p>
            Fill in <code>POSTGRES_PASSWORD</code> and <code>SERVER_WRAP_SECRET</code> (32+
            characters). Generate both:
          </p>
          <CodeBlock>
            {`openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 32   # SERVER_WRAP_SECRET`}
          </CodeBlock>
          <CodeBlock>
            {`docker compose up -d
docker compose logs -f web`}
          </CodeBlock>
          <p>
            First boot applies migrations, then the app listens on port 3000. The image sets{' '}
            <code>APP_ENV=production</code>, which means dashboard session cookies are{' '}
            <code>Secure</code> and named <code>__Host-session_token</code> - browsers will not
            store them on plain HTTP. Put TLS in front before registering in the web UI. The CLI
            authenticates with bearer tokens and does not need those cookies.
          </p>
        </section>

        <section className="docs-section">
          <div className="docs-label">03  configuration</div>
          <h2 className="docs-h2">Required, then optional</h2>
          <p>
            Compose reads <code>.env</code> from the same directory. Every variable in that file is
            passed into the web container. Missing or empty required secrets fail at{' '}
            <code>compose up</code> instead of at first request.
          </p>
          <h3 className="docs-h3">Required</h3>
          <p>
            <code>POSTGRES_PASSWORD</code>: the bundled database. The port is not published, so
            this only guards the compose network.
          </p>
          <p>
            <code>SERVER_WRAP_SECRET</code> - encrypts the few values the server has to wrap
            itself: pending invite org keys, and env-var history. Minimum 32 characters. Rotate it
            and everything wrapped under the old value is unrecoverable. Keep it next to the
            database backups.
          </p>
          <h3 className="docs-h3">Recommended</h3>
          <p>
            <code>APP_URL</code>: public origin, used in verification and invite emails. Falls
            back to the request <code>Host</code> when unset; set it explicitly behind a reverse
            proxy (<code>https://shh.example.com</code>).
          </p>
          <p>
            <code>HTTP_PORT</code>: host port published to the container&rsquo;s 3000 (default
            3000).
          </p>
          <p>
            <code>TRUSTED_PROXY_COUNT</code>: how many proxy hops sit in front, so per-IP rate
            limiting reads the right address from <code>X-Forwarded-For</code> (default 1).
          </p>
          <h3 className="docs-h3">Email - pick one</h3>
          <p>
            Without either option, verification and invite emails are not sent, and new accounts
            cannot get past the email-verification gate.
          </p>
          <p>
            <strong>Resend.</strong> Set <code>RESEND_API_KEY</code> and optionally{' '}
            <code>EMAIL_FROM</code> (default <code>itsasecret &lt;onboarding@resend.dev&gt;</code>
            ). Verification, org invites, team add/remove, and billing-failure mail go to inboxes.{' '}
            <code>FEEDBACK_EMAIL</code> forwards the in-app feedback form (Resend only).
          </p>
          <p>
            <strong>Log delivery.</strong> Set <code>EMAIL_DELIVERY=log</code> and read links from{' '}
            <code>docker compose logs -f web</code>. Hand them to users yourself. Never turn this
            on where logs are aggregated somewhere you do not control: the lines include
            single-use tokens.
          </p>
          <h3 className="docs-h3">Optional</h3>
          <p>
            <strong>Stripe.</strong> <code>STRIPE_SECRET_KEY</code>,{' '}
            <code>STRIPE_TEAM_PRICE_ID</code>, <code>STRIPE_WEBHOOK_SECRET</code>. Without the
            secret key, billing endpoints return 503 and every org stays on free-plan limits: 20
            projects, no inviting members, no creating teams. Existing members (if you later
            downgrade) keep working. Personal orgs are single-member either way.
          </p>
          <p>
            <strong>CLI downloads.</strong> <code>BUCKET_ENDPOINT</code>, <code>BUCKET_NAME</code>,{' '}
            <code>BUCKET_ACCESS_KEY_ID</code>, <code>BUCKET_SECRET_ACCESS_KEY</code>, optional{' '}
            <code>BUCKET_REGION</code> (default <code>auto</code>). These serve{' '}
            <code>/install.sh</code> and <code>/api/dl/*</code> from an S3-compatible bucket.
            Unset, those routes 503. Install the CLI from{' '}
            <a href="https://github.com/rockydotsystems/itsasecret-client">GitHub releases</a> or
            from itsasecret.dev, then point it at your origin.
          </p>
        </section>

        <section className="docs-section">
          <div className="docs-label">04  reverse proxy</div>
          <h2 className="docs-h2">Terminate TLS in front</h2>
          <p>
            Put Caddy, nginx, or Traefik in front of port 3000 and set{' '}
            <code>APP_URL=https://your.domain</code>. Forward <code>X-Forwarded-Proto</code> and{' '}
            <code>X-Forwarded-For</code>. If there is more than one trusted hop, raise{' '}
            <code>TRUSTED_PROXY_COUNT</code>.
          </p>
          <p>
            Requests that arrive as HTTPS get <code>Strict-Transport-Security</code>. The app
            denies framing (<code>X-Frame-Options: DENY</code>) and does not cache API responses.
          </p>
        </section>

        <section className="docs-section">
          <div className="docs-label">05  the CLI</div>
          <h2 className="docs-h2">Point shh at your origin</h2>
          <CodeBlock>
            <span className="term-prompt">$ </span>
            <span className="term-cmd">shh config set url</span> https://shh.example.com{'\n'}
            Server URL set to https://shh.example.com for this machine.{'\n'}
            <span className="term-dim">Run `shh login` if you haven&rsquo;t authenticated against it yet.</span>
            {'\n'}
            {'\n'}
            <span className="term-prompt">$ </span>
            <span className="term-cmd">shh login</span>
          </CodeBlock>
          <p>
            A repo can carry the server with it:{' '}
            <code>shh config set url https://shh.example.com --project</code> writes{' '}
            <code>url =</code> into <code>.shh.project</code>. That line wins over the machine
            config, so every clone hits the right instance. <code>shh config get url</code> tells
            you which one is in effect.
          </p>
          <p>
            If you configured the download bucket, teammates can install from your instance:
          </p>
          <CodeBlock>
            <span className="term-prompt">$ </span>
            <span className="term-cmd">curl -fsSL https://shh.example.com/install.sh | sh</span>
            {'\n'}
            <span className="term-dim"># or, from another installer, override the origin:</span>
            {'\n'}
            SHH_BASE_URL=https://shh.example.com curl -fsSL https://itsasecret.dev/install.sh | sh
          </CodeBlock>
        </section>

        <section className="docs-section">
          <div className="docs-label">06  first account</div>
          <h2 className="docs-h2">Register, then verify</h2>
          <p>
            Nothing is provisioned at signup. After email verification, the onboarding wizard
            creates the personal org, first project, and first environment. Unverified accounts
            cannot use the rest of the app.
          </p>
          <p>
            With <code>EMAIL_DELIVERY=log</code>, the verify link prints to the web container log.
            Open it, then log in. Invites work the same way: the accept link is logged instead of
            emailed.
          </p>
        </section>

        <section className="docs-section">
          <div className="docs-label">07  updates & backups</div>
          <h2 className="docs-h2">Pull the image, dump Postgres</h2>
          <CodeBlock>
            {`docker compose pull
docker compose up -d`}
          </CodeBlock>
          <p>
            Migrations run at boot (<code>MIGRATE_ON_BOOT=1</code>). A failed migration exits the
            process, so an orchestrator that keeps the previous container leaves you on the last
            good schema instead of serving a half-migrated one.
          </p>
          <p>
            All state is in the <code>pgdata</code> volume. A dump is enough:
          </p>
          <CodeBlock>{`docker compose exec postgres pg_dump -U itsasecret itsasecret > backup.sql`}</CodeBlock>
          <p>
            Back up <code>.env</code> with it. Data wrapped under <code>SERVER_WRAP_SECRET</code>{' '}
            cannot be recovered without that value.
          </p>
          <h3 className="docs-h3">Build from source</h3>
          <p>
            The compose file can build the image instead of pulling it. Clone{' '}
            <a href="https://github.com/rockydotsystems/itsasecret-www">itsasecret-www</a>, copy{' '}
            <code>deploy/.env.example</code> to <code>deploy/.env</code>, and from{' '}
            <code>deploy/</code>:
          </p>
          <CodeBlock>{`docker compose up -d --build`}</CodeBlock>
        </section>
      </main>

      <SiteFooter loggedIn={!!user} />
    </>
  )
}
