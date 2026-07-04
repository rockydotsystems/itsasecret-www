# AGENTS.md — www (itsasecret API + website)

## What this is

The TanStack Start app that serves the itsasecret API and website. A CLI+website
for syncing env vars/secrets across environments (production → staging → dev
forks). Full product/architecture docs live in `../docs/`.

## Tech stack

- **Runtime**: Node.js (custom infra; Cloudflare DNS only)
- **Framework**: TanStack Start (React + TanStack Router + Vite + Nitro)
- **Database**: Postgres 17 (local Docker via `docker-compose.yml`) with Drizzle ORM
- **Auth**: master-password-derived key (Argon2id KDF) + ECDH per-session transport key + server-side sessions in Postgres
- **Crypto**: envelope encryption — user password unwraps org shared key, shared key unwraps secret value, server re-encrypts with ephemeral session key for transport
- **Web UI**: React (SSR + hydration via TanStack Start)
- **API**: TanStack Start server routes (file-based, under `src/routes/api/`)

## Commands (via nix flake)

```
nix develop                    # enter dev shell (node)
nix run .#dev                  # vite dev (local)
nix run .#test                 # vitest run
nix run .#typecheck            # tsc --noEmit
nix run .#db-push              # push schema to Postgres
nix run .#db-migrate           # run drizzle-kit migrations
nix run .#db-generate          # generate drizzle-kit migrations
pnpm install                   # first-time dep install (inside dev shell)
docker compose up -d           # start Postgres 17
```

## Key decisions (from docs/)

- **Single Postgres database** for all orgs — relational domain (users ↔ orgs ↔ projects ↔ environments ↔ RBAC) favors joins/FKs over per-tenant sharding.
- **Soft deletes, no ON DELETE CASCADE** — `deleted_at` column on retention-sensitive tables (`env_vars`, `secrets`, `environments`, `projects`). Daily setInterval purges rows older than 90 days.
- **Web secret reveal/edit is E2E** — the browser asks for the master password once per session (auto-seeded at login), derives the master key client-side (Argon2id), unwraps `org_members.wrapped_org_key` locally (`GET /api/orgs/:id/key` returns the caller's own wrapped key), and decrypts/encrypts secrets in the browser (`src/lib/vault.ts`). The master key is cached in sessionStorage encrypted under a non-extractable AES key in IndexedDB; no key material or plaintext reaches the server. `GET /api/envs/:id/secrets/:key/encrypted` returns the stored ciphertext verbatim; `PUT .../secrets/:key` with `cipher: 'org'` stores client-encrypted values verbatim. The CLI keeps the session-transport-key flow (`cipher: 'session'`, default).
- **Secrets and vars keep encrypted history for 7 days** — every update/delete snapshots the previous value into `secret_history` / `env_var_history` (`src/lib/history.ts`). Secret history stores the org-key ciphertext as-is (stays E2E); var history is encrypted at rest under `SERVER_WRAP_SECRET` (live var values are plaintext by design). The daily purge cron deletes history rows older than 7 days (before the 90-day parent purges — no CASCADE).
- **Server-side sessions in Postgres** (not JWT) — need revocation for kicked users, password resets, org ownership transfer.
- **RBAC roles at environment level**: `read`, `write`, `admin`. Forking an environment grants full (admin) to the forker on the fork only, not the parent.
- **Personal orgs stay single-member** — sharing only via explicitly-created shared orgs.
- **No MFA in v1** — master-password auth first; TOTP/passkeys later.
- **Password hash is independent from the KDF-derived key** — the online authentication hash uses its own Argon2id salt/parameters so it cannot leak the master key that wraps organization keys.
- **Login/register endpoints have per-IP rate limiting and timing-attack mitigations** — failed logins burn a dummy password hash so response times do not reveal whether an email is registered.
- **Invites use a server-side pending re-key** (interim, see docs/open-questions.md #3) — an inviter cannot wrap the org key for the invitee's master key, so `/api/orgs/:id/invite` (owner/admin, shared orgs only) recovers the org key via the caller's `X-Session-Key`, stores it in `org_members.wrapped_org_key` with a `pending:` prefix wrapped under `SERVER_WRAP_SECRET` (env var, required in production), and the invitee's next login re-wraps it under their master key (`src/lib/pending-org-key.ts`).
- **Removing an org member revokes all their sessions** — their sessions carry the org key; other-org access is re-established on next login.
- **API routes are TanStack Start server routes** — the Go CLI calls these as raw HTTP endpoints (not server functions).
- **Email verification is tracked from signup and gates the whole app** — `users.email_verified_at` (null = unverified). Register issues a single-use token (`email_verifications`, hashed like sessions) and sends the link via Resend (`RESEND_API_KEY`/`EMAIL_FROM`). With no `RESEND_API_KEY`, the link is printed to the server terminal so accounts can be verified in dev without Resend. `GET /api/auth/verify-email?token=` consumes it and redirects to `/login?verified=1` (login shows a success banner; `verified=0` shows an invalid/expired banner).
- **Nothing is provisioned at signup — onboarding creates the first workspace** — register creates only the `users` row (session starts with empty org keys). A verified user with zero live org memberships is redirected by `requireAuthBeforeLoad` to `/onboarding`, a 4-step wizard (welcome → org name → project name → env name) that wraps the personal org key client-side (vault master key seeded at login; master-password fallback in a fresh tab) and posts to `POST /api/onboarding`, which creates the personal org + first project + first environment in one shot and 409s once the user has any live org. `POST /api/orgs` no longer auto-creates a `default` project — new shared orgs start empty; `POST /api/orgs/:id/projects` still auto-creates a `production` env (product spec).
- **Unverified accounts are locked out by default** — `requireAuth` throws `403 Email not verified` unless called with `{ allowUnverified: true }`; only `me`, `logout`, and `resend-verification` opt out. So every current/future protected API route is gated by one check. Web pages: `requireAuthBeforeLoad` redirects unverified users to `/verify-email` (a holding page with resend + logout). `POST /api/auth/resend-verification` re-issues a link (rate-limited).
- **Route guards use `beforeLoad` with server-side cookie check** — protected pages redirect to `/login?redirect=<origin>`; logged-in users hitting `/login` or `/register` are redirected to `/dashboard`.

## Repo layout

```
www/
  flake.nix              # nix dev shell + apps
  docker-compose.yml     # Postgres 17 container
  vite.config.ts         # Vite + TanStack Start + Nitro config
  tsconfig.json          # TypeScript config (React, Node, path aliases)
  drizzle.config.ts      # Drizzle Kit config
  src/
    router.tsx           # TanStack Router instance
    start.ts             # TanStack Start config (global middleware, cron purge)
    routes/              # File-based routes (UI pages + API server routes)
      __root.tsx         # Root layout (HTML shell, CSS import)
      index.tsx          # Landing page
      login.tsx          # Login page
      register.tsx       # Register page
      onboarding.tsx     # First-workspace wizard (org → project → env)
      dashboard.tsx      # Dashboard page
      api/               # API server routes (HTTP endpoints for CLI + web)
    lib/
      db.ts              # Drizzle + postgres-js connection
      schema.ts          # Drizzle pgTable definitions for all 10 tables
      db-utils.ts        # generateId, per-table softDelete, auditLog
      auth.ts            # requireAuth helper, session key utils, error handling, getCurrentUserFromRequest
      auth-server.ts     # getCurrentUserFn server function (reads session cookie)
      route-guards.ts    # requireAuthBeforeLoad / requireGuestBeforeLoad route guards
      session-cookie.ts  # session_token cookie helpers (Set-Cookie / read)
      rbac.ts            # requireOrgRole, requireEnvRole helpers
      sessions.ts        # createSession, revokeSession
      crypto/            # envelope encryption (encrypt/decrypt/wrap/unwrap)
    components/          # React UI components
    styles.css           # Global styles (design system)
```

## Version control

This repo uses **jj** (Jujutsu). Use `jj new` to create new revisions — do not
write descriptions (the repo owner handles that). Don't use `git commit`.

## Conventions

- TypeScript strict mode.
- No `ON DELETE CASCADE` in migrations.
- Every retention-sensitive table gets `deleted_at` + filtered reads.
- Secrets never logged, never returned in plaintext without explicit reveal endpoint.
- Use `crypto.randomUUID()` for IDs, never `Math.random()`.
- API server routes use `createFileRoute` with `server.handlers` — not server functions (CLI needs raw HTTP).
- Path alias: `~/*` → `src/*`.
- `class` → `className` in React JSX.
