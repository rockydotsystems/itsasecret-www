# AGENTS.md - www (itsasecret API + website)

## What this is

The TanStack Start app that serves the itsasecret API and website. A CLI+website
for syncing env vars/secrets across environments (production → staging → dev
forks). Full product/architecture docs live in `../docs/`.

## Tech stack

- **Runtime**: Node.js (custom infra; Cloudflare DNS only)
- **Framework**: TanStack Start (React + TanStack Router + Vite + Nitro)
- **Database**: Postgres 17 (local Docker via `docker-compose.yml`) with Drizzle ORM
- **Auth**: master-password-derived key (Argon2id KDF) + ECDH per-session transport key + server-side sessions in Postgres
- **Crypto**: envelope encryption - user password unwraps org shared key, shared key unwraps secret value, server re-encrypts with ephemeral session key for transport
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

- **Single Postgres database** for all orgs - relational domain (users ↔ orgs ↔ projects ↔ environments ↔ RBAC) favors joins/FKs over per-tenant sharding.
- **Soft deletes, no ON DELETE CASCADE** - `deleted_at` column on retention-sensitive tables (`env_vars`, `secrets`, `environments`, `projects`). Daily setInterval purges rows older than 90 days.
- **Web secret reveal/edit is E2E** - the browser asks for the master password once per session (auto-seeded at login), derives the master key client-side (Argon2id), unwraps `org_members.wrapped_org_key` locally (`GET /api/orgs/:id/key` returns the caller's own wrapped key), and decrypts/encrypts secrets in the browser (`src/lib/vault.ts`). The master key is cached in sessionStorage encrypted under a non-extractable AES key in IndexedDB; no key material or plaintext reaches the server. `GET /api/envs/:id/secrets/:key/encrypted` returns the stored ciphertext verbatim; `PUT .../secrets/:key` with `cipher: 'org'` stores client-encrypted values verbatim. The CLI keeps the session-transport-key flow (`cipher: 'session'`, default).
- **Bulk .env import is client-side only** (`src/components/importenvmodal.tsx`) - pasted contents or a picked file are parsed in the browser (`src/lib/dotenv-parse.ts`; comments, `export`, single/double quotes w/ escapes, multiline quoted values, no `$VAR` expansion, duplicates last-wins), reviewed per row (default secret, flippable to var, excludable, overwrite-of-existing flagged), then upserted sequentially through the same per-key `setSecret` (`cipher: 'org'`, E2E) / `setVar` endpoints - no bulk server route, per-key history and audit stay intact.
- **Secrets and vars keep encrypted history for 7 days** - every update/delete snapshots the previous value into `secret_history` / `env_var_history` (`src/lib/history.ts`). Secret history stores the org-key ciphertext as-is (stays E2E); var history is encrypted at rest under `SERVER_WRAP_SECRET` (live var values are plaintext by design). The daily purge cron deletes history rows older than 7 days (before the 90-day parent purges - no CASCADE).
- **Server-side sessions in Postgres** (not JWT) - need revocation for kicked users, password resets, org ownership transfer.
- **Session cookie name differs by scheme** (`src/lib/session-cookie.ts`) - HTTPS/prod sets `__Host-session_token` with `Secure`; plain-HTTP localhost dev cannot (browsers reject `__Host-` without `Secure`), so it sets unprefixed `session_token` instead. Every cookie reader must accept both (`extractSessionToken` in `auth.ts` + the `getCookie(...) ?? getCookie(...)` pattern).
- **RBAC roles at environment level**: `read`, `write`, `admin`. Forking an environment grants full (admin) to the forker on the fork only, not the parent.
- **Teams are an authorization-only grouping of org members** (design: `../docs/teams-design.md`) - no per-team keys; the org key stays the sole crypto boundary. Grants attach to environments (`team_env_permissions`, managed by env admins) or whole projects (`team_project_permissions`, org owner/admin only - covers every current AND future env in the project, forks included). Effective env role for a plain member = max(direct grant, team env grants, team project grants), additive, no deny rules; computed ONLY by `memberEnvRole` in `src/lib/rbac.ts` (used by both `requireEnvRole` enforcement and dashboard display - never reimplement it). Teams soft-delete (`deleted_at`, partial unique name index) and the resolver filters deleted teams, so their grants die instantly. Removing an org member app-deletes their `team_members` rows (no CASCADE). Personal orgs reject teams. Managed in org settings UI; env/project grants in the Access dialog + project settings. Adding someone to a team (or removing them) sends a best-effort notification email (`sendTeamAddedEmail` / `sendTeamRemovedEmail` - pure heads-up, no accept step; dev logs to the terminal; removal only emails when a membership row actually existed).
- **Personal orgs stay single-member** - sharing only via explicitly-created shared orgs.
- **No MFA in v1** - master-password auth first; TOTP/passkeys later.
- **Password hash is independent from the KDF-derived key** - the online authentication hash uses its own Argon2id salt/parameters so it cannot leak the master key that wraps organization keys.
- **Login/register endpoints have per-IP rate limiting and timing-attack mitigations** - failed logins burn a dummy password hash so response times do not reveal whether an email is registered.
- **Invites are emailed accept links; membership is created on acceptance** -
  `POST /api/orgs/:id/invite` (owner/admin, shared orgs only) no longer requires
  the invitee to have an account: it writes an `org_invites` row (hashed
  single-use token like sessions, 7-day TTL, lowercased email) and emails the
  accept link via Resend (`sendOrgInviteEmail`; dev prints it to the terminal).
  Re-inviting the same address revokes the old pending invite and sends a fresh
  link; owner/admin can revoke from org settings (`DELETE
  /api/orgs/:id/invites/:inviteId`). The public `/invite?token=` page routes
  logged-out users through login/register (redirect + email prefill) and
  `POST /api/invites/accept` creates the `org_members` row - acceptance is
  bound to the invited address (case-insensitive). Acceptance grants
  membership only: the inviter controls the token, so it proves nothing about
  inbox control and `email_verified_at` is never stamped by it. Accepting or
  revoking an invite also blanks the stored `wrapped_org_key` so a dead link
  doesn't carry a usable key until the 90-day purge.
  Audit actions: `member.invite` (target = email), `member.invite.accept`,
  `member.invite.revoke`. Expired invites purge with the daily cron after 90
  days.
- **Invites use a server-side pending re-key** (interim, see docs/open-questions.md #3) - an inviter cannot wrap the org key for the invitee's master key, so the invite route recovers the org key via the caller's `X-Session-Key` and stores it on the `org_invites` row with a `pending:` prefix wrapped under `SERVER_WRAP_SECRET` (env var, required in production). Acceptance copies it into `org_members.wrapped_org_key`, and the invitee's next login re-wraps it under their master key (`src/lib/pending-org-key.ts`).
- **Removing an org member strips that org from their sessions** - interactive (web/cli) sessions are revoked outright; long-lived token sessions survive but get the removed org's key deleted from `encrypted_org_keys` (personal-org CI stays alive). A token session with unparsable key data falls back to revocation.
- **API routes are TanStack Start server routes** - the Go CLI calls these as raw HTTP endpoints (not server functions).
- **Email verification is tracked from signup and gates the whole app** - `users.email_verified_at` (null = unverified). Register issues a single-use token (`email_verifications`, hashed like sessions) and sends the link via Resend (`RESEND_API_KEY`/`EMAIL_FROM`). With no `RESEND_API_KEY`, the link is printed to the server terminal so accounts can be verified in dev without Resend; self-hosted instances (production) opt into the same terminal fallback explicitly via `EMAIL_DELIVERY=log` — never set that on hosted prod (tokens/feedback would land in aggregated logs). `GET /api/auth/verify-email?token=` consumes it and redirects to `/login?verified=1` (login shows a success banner; `verified=0` shows an invalid/expired banner).
- **Nothing is provisioned at signup - onboarding creates the first workspace** - register creates only the `users` row (session starts with empty org keys). A verified user with zero live org memberships is redirected by `requireAuthBeforeLoad` to `/onboarding`, a 4-step wizard (welcome → org name → project name → env name) that wraps the personal org key client-side (vault master key seeded at login; master-password fallback in a fresh tab) and posts to `POST /api/onboarding`, which creates the personal org + first project + first environment in one shot and 409s once the user has any live org. `POST /api/orgs/:id/projects` still auto-creates a `production` env (product spec).
- **A typed master password is verified server-side before it wraps anything** - when the vault is locked, the workspace wizard's password fallback has no client-side proof the password is correct for a first workspace (no org key to test-unwrap), so `src/lib/org-form.ts` first posts it to `POST /api/auth/verify-password` (authenticated, shares the `passwd:` per-user rate-limit budget with change-password), then seeds the vault via `seedVaultFromLogin` and only then derives + wraps. Never wrap an org key under an unverified typed password: a mistyped one corrupts `org_members.wrapped_org_key` (unwrappable by the real master key). For rows already corrupted that way, login and change-password skip them (audit metadata `skippedCorruptOrgKeys` + console.error) instead of failing the whole operation.
- **One wizard for both workspace-creation flows** - `src/components/workspacewizard.tsx` drives onboarding (mode `'onboarding'`: intro step, personal org, page-sized headings) and the dashboard's "+ New org" modal (mode `'org'`: no intro, shared org, compact `.wizard-title` headings). Both go through `src/lib/org-form.ts` (`completeOnboarding` / `createOrgWorkspace`), which share the client-side org-key wrapping. `POST /api/orgs` takes optional `projectName`/`envName` to create the org's first project + env in the same request (omitted → bare empty org) and returns `{ org, projectId }` (`projectId` null for a bare org).
- **Unverified accounts are locked out by default** - `requireAuth` throws `403 Email not verified` unless called with `{ allowUnverified: true }`; only `me`, `logout`, and `resend-verification` opt out. So every current/future protected API route is gated by one check. Web pages: `requireAuthBeforeLoad` redirects unverified users to `/verify-email` (a holding page with resend + logout). `POST /api/auth/resend-verification` re-issues a link (rate-limited).
- **Route guards use `beforeLoad` with server-side cookie check** - protected pages redirect to `/login?redirect=<origin>`; logged-in users hitting `/login` or `/register` are redirected to `/dashboard`.

- **Migrations run automatically at boot in production** - `start.ts` runs
  `src/lib/migrate-on-boot.ts` (drizzle-orm postgres-js migrator, `drizzle/`
  folder copied into the Docker image) when `MIGRATE_ON_BOOT` is set (it is,
  on the Railway `web` service and in the self-hosting `deploy/docker-compose.yml`). A failed migration exits the process, so the
  deploy fails healthcheck and the previous deployment stays live. Local dev
  keeps explicit `db:push`/`db:migrate`. Safe only while replicas stay pinned
  to 1 (same constraint as the purge cron).
- **CLI installer is served by this app** - `/install.sh` (a server route that
  returns `src/assets/install.sh` via `?raw` import; `public/` static assets
  are NOT served in this nitro setup, don't use them) and `/api/dl/$target`,
  which 302-redirects allowlisted names (`itsasecret_<os>_<arch>`,
  `checksums.txt`, `version.json`) to 5-minute presigned GETs against the
  private Railway bucket (`src/lib/s3-presign.ts`, hand-rolled SigV4 -
  tested against the AWS known-answer vector). Binaries land in the bucket
  under `cli/latest/` from the client repo's release workflow. Needs
  `BUCKET_ENDPOINT`/`BUCKET_NAME`/`BUCKET_ACCESS_KEY_ID`/
  `BUCKET_SECRET_ACCESS_KEY` (+ optional `BUCKET_REGION`, default `auto`) -
  set on the Railway `web` service; without them the route 503s.
- **Profile page at `/dashboard/profile`** (`src/components/profilesettings.tsx`,
  client calls in `src/lib/profile-form.ts`): display name (`users.name`,
  nullable - empty stores null), master-password change, and feedback.
- **Display-name inputs share one validator** (`displayName()` in
  `src/lib/validation.ts`) - user/org/project/env/team/access-token names are
  trimmed, length-bounded, single-line (no control characters; newlines in
  email subjects would be header injection), and must contain at least one
  letter or number (`"*"`, `"   "`, emoji-only are rejected). Emails are
  trimmed before `z.string().email()`. Free-text fields (feedback message) and
  secret/var values stay unrestricted apart from size caps - values must
  support arbitrary content by design.
- **Billing is Stripe via a hand-rolled REST client** (`src/lib/stripe.ts` - no
  SDK, same discipline as `s3-presign.ts`). Env: `STRIPE_SECRET_KEY`,
  `STRIPE_TEAM_PRICE_ID` (monthly per-seat Team price),
  `STRIPE_WEBHOOK_SECRET`. Without the secret key `isBillingEnabled()` is false:
  checkout/portal 503 and every org stays on free limits (enforcement is
  DB-side, not Stripe-side). Plans (`src/lib/plans.ts`, public constants in
  `src/lib/plans-shared.ts`): `orgs.plan` ('free'|'team') is the source of
  truth for limits - free 20 projects, team 50 - enforced by
  `assertProjectCapacity` on project creation; over-limit orgs after a
  downgrade keep everything, they just can't create more. Collaboration
  (inviting members, creating teams) is Team-only - `assertCollaborationAllowed`
  gates `POST /api/orgs/:id/invite` and `POST /api/orgs/:id/teams` (402), the
  org-settings UI keys off `BillingView.collaborationAllowed`, and an org
  downgraded to free keeps its existing members/teams/grants working, it just
  can't add new ones until it upgrades again. Personal orgs are structurally
  single-member and can't have teams regardless of plan. Billable seats =
  members minus one free super-user, floor 1;
  `syncOrgSeats` re-pushes the quantity to Stripe (fire-and-forget after
  member add/remove, `proration_behavior=always_invoice`).
  `billing_subscriptions` (one row per org that ever checked out; customer id
  survives cancellation for re-subscribe) is synced by
  `POST /api/billing/webhook`, which is exempt from the API CSRF middleware in
  `start.ts` and authenticated by the Stripe-Signature HMAC over the raw body;
  `billing_events` is the idempotency ledger (insert-first, unique-conflict =
  replay). Paid statuses are active/trialing/past_due (dunning grace);
  `invoice.payment_failed` marks past_due and emails the org owner. The web UI
  never collects card data - upgrade goes through Stripe-hosted Checkout
  (`POST /api/orgs/:id/billing/checkout`, owner/admin, shared orgs only),
  management through the hosted portal
  (`POST /api/orgs/:id/billing/portal`); both return URLs redirected back to
  `/dashboard/:orgId/settings?billing=success|canceled`. Teleportation between
  plans never happens client-side - only `applySubscription` in the webhook
  flips `orgs.plan`.
- **Password change follows the login trust model** (`POST
  /api/auth/change-password`): the server sees the password transiently, never
  stores it - verify current password, unwrap every non-pending
  `org_members.wrapped_org_key` with the old master key, re-wrap under the new
  one (fresh KDF salt + current default params), swap `password_hash` in one
  transaction. Rows that don't unwrap under the verified old master key are
  corrupt (wrapped under a mistyped password); they are skipped and logged,
  not fatal. Revokes all OTHER web/cli sessions (`revokeOtherInteractiveSessions`);
  long-lived access tokens survive on purpose (separate machine-credential
  lifecycle, org keys unchanged). The client re-seeds the vault with the new
  password; other tabs' cached master keys go stale and re-prompt.
- **User avatars are Gravatar with a "boring avatars" fallback**
  (`src/components/avatar.tsx`): pass `email` for user avatars - SHA-256
  Gravatar URL with `d=404` layered over a locally-drawn marble-variant SVG
  (the gradient one; brand palette, no external fallback service, no
  initials); the image only shows after `onLoad`, so no-gravatar/stock-default
  accounts keep the marble. Team avatars pass only `name` and always render
  the marble.
- **Feedback is stored in the `feedback` table** (source of truth, kept
  forever) and forwarded best-effort by email to `FEEDBACK_EMAIL` via Resend
  (`sendFeedbackEmail`); without `RESEND_API_KEY`/`FEEDBACK_EMAIL` it logs to
  the terminal. Per-user rate limit where every submission counts.

## Repo layout

```
www/
  flake.nix              # nix dev shell + apps
  docker-compose.yml     # Postgres 17 container (local dev only)
  Dockerfile             # Prod image - published to Docker Hub as itsasecret/web
  deploy/                # Self-hosting bundle: compose (app+Postgres), .env.example, README
  .github/workflows/     # deploy.yml (Railway) + docker.yml (Docker Hub push)
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
      schema.ts          # Drizzle pgTable definitions for all tables
      db-utils.ts        # generateId, per-table softDelete, auditLog
      auth.ts            # requireAuth helper, session key utils, error handling, getCurrentUserFromRequest
      auth-server.ts     # getCurrentUserFn server function (reads session cookie)
      route-guards.ts    # requireAuthBeforeLoad / requireGuestBeforeLoad route guards
      session-cookie.ts  # session_token cookie helpers (Set-Cookie / read)
      rbac.ts            # requireOrgRole, requireEnvRole, memberEnvRole (teams-aware effective-role resolver)
      stripe.ts          # hand-rolled Stripe REST client + webhook HMAC verification
      plans.ts           # plan limits, project-cap enforcement, seat sync (server-only)
      plans-shared.ts    # plan constants safe for client imports
      teams.ts           # getLiveTeam, listOrgTeams helpers
      sessions.ts        # createSession, revokeSession
      crypto/            # envelope encryption (encrypt/decrypt/wrap/unwrap)
    components/          # React UI components
    styles.css           # Global styles (design system)
```

## Version control

This repo uses **jj** (Jujutsu). Use `jj new` to create new revisions - do not
write descriptions (the repo owner handles that). Don't use `git commit`.

## Conventions

- TypeScript strict mode.
- No `ON DELETE CASCADE` in migrations.
- Every retention-sensitive table gets `deleted_at` + filtered reads.
- Secrets never logged, never returned in plaintext without explicit reveal endpoint.
- Use `crypto.randomUUID()` for IDs, never `Math.random()`.
- API server routes use `createFileRoute` with `server.handlers` - not server functions (CLI needs raw HTTP).
- Path alias: `~/*` → `src/*`.
- `class` → `className` in React JSX.
