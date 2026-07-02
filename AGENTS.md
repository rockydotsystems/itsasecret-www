# AGENTS.md — www (itsasecret API + website)

## What this is

The TanStack Start app that serves the itsasecret API and website. A CLI+website
for syncing env vars/secrets across environments (production → staging → dev
forks). Full product/architecture docs live in `../docs/`.

## Tech stack

- **Runtime**: Node.js (custom infra; Cloudflare DNS only)
- **Framework**: TanStack Start (React + TanStack Router + Vite + Nitro)
- **Database**: SQLite via better-sqlite3 (single shared database, not per-org sharded)
- **Auth**: master-password-derived key (Argon2id KDF) + ECDH per-session transport key + server-side sessions in SQLite
- **Crypto**: envelope encryption — user password unwraps org shared key, shared key unwraps secret value, server re-encrypts with ephemeral session key for transport
- **Web UI**: React (SSR + hydration via TanStack Start)
- **API**: TanStack Start server routes (file-based, under `src/routes/api/`)

## Commands (via nix flake)

```
nix develop                    # enter dev shell (node)
nix run .#dev                  # vite dev (local)
nix run .#test                 # vitest run
nix run .#typecheck            # tsc --noEmit
nix run .#db-apply             # apply migrations
npm install                    # first-time dep install (inside dev shell)
```

## Key decisions (from docs/)

- **Single SQLite database** for all orgs — relational domain (users ↔ orgs ↔ projects ↔ environments ↔ RBAC) favors joins/FKs over per-tenant sharding.
- **Soft deletes, no ON DELETE CASCADE** — `deleted_at` column on retention-sensitive tables (`env_vars`, `secrets`, `environments`, `projects`). Daily setInterval purges rows older than 90 days.
- **Server-side sessions in SQLite** (not JWT) — need revocation for kicked users, password resets, org ownership transfer.
- **RBAC roles at environment level**: `read`, `write`, `admin`. Forking an environment grants full (admin) to the forker on the fork only, not the parent.
- **Personal orgs stay single-member** — sharing only via explicitly-created shared orgs.
- **No MFA in v1** — master-password auth first; TOTP/passkeys later.
- **API routes are TanStack Start server routes** — the Go CLI calls these as raw HTTP endpoints (not server functions).

## Repo layout

```
www/
  flake.nix              # nix dev shell + apps
  vite.config.ts         # Vite + TanStack Start + Nitro config
  tsconfig.json          # TypeScript config (React, Node, path aliases)
  migrations/            # SQLite SQL migrations
  src/
    router.tsx           # TanStack Router instance
    start.ts             # TanStack Start config (global middleware, cron purge)
    routes/              # File-based routes (UI pages + API server routes)
      __root.tsx         # Root layout (HTML shell, CSS import)
      index.tsx          # Landing page
      login.tsx          # Login page
      register.tsx       # Register page
      dashboard.tsx      # Dashboard page
      api/               # API server routes (HTTP endpoints for CLI + web)
    lib/
      db.ts              # better-sqlite3 connection + D1-compatible wrapper
      db-utils.ts        # generateId, softDelete, auditLog
      types.ts           # Row types
      auth.ts            # requireAuth helper, session key utils, error handling
      rbac.ts            # requireOrgRole, requireEnvRole helpers
      sessions.ts        # createSession, revokeSession
      crypto/            # envelope encryption (encrypt/decrypt/wrap/unwrap)
      migrate.ts         # standalone migration runner
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
