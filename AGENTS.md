# AGENTS.md — www (itsasecret API + website)

## What this is

The Cloudflare Worker that serves the itsasecret API and website. A CLI+website
for syncing env vars/secrets across environments (production → staging → dev
forks). Full product/architecture docs live in `../docs/`.

## Tech stack

- **Runtime**: Cloudflare Workers (TypeScript end-to-end)
- **Framework**: Hono + `@hono/zod-openapi` (typed routes → OpenAPI spec → `hono/client` RPC for the website)
- **Database**: single shared Cloudflare D1 (SQLite) — not per-org sharded
- **Auth**: master-password-derived key (Argon2id KDF) + ECDH per-session transport key + server-side sessions in D1
- **Crypto**: envelope encryption — user password unwraps org shared key, shared key unwraps secret value, server re-encrypts with ephemeral session key for transport
- **Email**: Cloudflare Email Service
- **Web UI**: Hono JSX (server-rendered)

## Commands (via nix flake)

```
nix develop                    # enter dev shell (node + wrangler)
nix run .#dev                  # wrangler dev (local)
nix run .#test                 # vitest run
nix run .#typecheck            # tsc --noEmit (run `npx wrangler types` first if bindings change)
nix run .#db-apply             # apply D1 migrations (local)
npm install                    # first-time dep install (inside dev shell)
```

## Key decisions (from docs/)

- **Single D1 database** for all orgs — relational domain (users ↔ orgs ↔ projects ↔ environments ↔ RBAC) favors joins/FKs over per-tenant sharding.
- **Soft deletes, no ON DELETE CASCADE** — `deleted_at` column on retention-sensitive tables (`env_vars`, `secrets`, `environments`, `projects`). Daily cron trigger purges rows older than 90 days.
- **Server-side sessions in D1** (not JWT) — need revocation for kicked users, password resets, org ownership transfer.
- **RBAC roles at environment level**: `read`, `write`, `admin`. Forking an environment grants full (admin) to the forker on the fork only, not the parent.
- **Personal orgs stay single-member** — sharing only via explicitly-created shared orgs.
- **No MFA in v1** — master-password auth first; TOTP/passkeys later.

## Repo layout

```
www/
  flake.nix              # nix dev shell + apps
  wrangler.jsonc         # Worker config (D1 binding, cron trigger)
  migrations/            # D1 SQL migrations
  src/
    index.ts             # Worker entry (fetch + scheduled handlers)
    app.ts               # Hono app, route registry
    routes/              # API route modules (zod-openapi)
    auth/                # KDF, ECDH, session middleware
    db/                  # D1 queries, soft-delete helpers
    crypto/              # envelope encryption (encrypt/decrypt/wrap/unwrap)
    rbac/                # permission middleware (read/write/admin)
    ui/                  # Hono JSX pages
  test/                  # vitest (pool-workers)
```

## Version control

This repo uses **jj** (Jujutsu). Use `jj new` to create new revisions — do not
write descriptions (the repo owner handles that). Don't use `git commit`.

## Conventions

- TypeScript strict mode, no `any` on bindings (run `wrangler types` to generate `Env`).
- No `ON DELETE CASCADE` in migrations.
- Every retention-sensitive table gets `deleted_at` + filtered reads.
- Secrets never logged, never returned in plaintext without explicit reveal endpoint.
- Use `crypto.randomUUID()` for IDs, never `Math.random()`.
