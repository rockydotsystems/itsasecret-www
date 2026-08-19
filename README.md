# itsasecret web + API

The web dashboard and HTTP API for [itsasecret](https://itsasecret.dev), the service that syncs encrypted secrets and env vars across environments. The [`shh` CLI](https://github.com/rockydotsystems/itsasecret-client) talks to the same API this app serves.

Secrets are encrypted end to end. The browser and the CLI seal values with a key derived from the user's master password, so the server only stores and serves ciphertext.

## Tech stack

- **Framework** | TanStack Start (React + TanStack Router + Vite + Nitro), server-rendered and hydrated.
- **Runtime** | Node.js.
- **Database** | Postgres 17 with Drizzle ORM.
- **API** | file-based server routes under `src/routes/api/`, called as plain HTTP by the web app and the CLI.

## Local development

You need **Node 22+**, **pnpm**, and **Docker** (for Postgres). If you use Nix, `nix develop` drops you into a shell with all three.

```sh
# 1. install dependencies
pnpm install

# 2. start Postgres 17 (localhost:5432, user/pass/db all "itsasecret")
docker compose up -d postgres

# 3. create the schema
pnpm db:push

# 4. run the dev server
pnpm dev
```

The app is now at http://localhost:3000. The default database connection matches the Docker container, so no configuration is needed to get started.

### Nix shortcuts

If you prefer, the flake wraps the same tasks and starts Postgres for you:

```sh
nix run .#db          # start Postgres and wait for it to be ready
nix run .#dev         # dev server
nix run .#db-push     # push schema
nix run .#db-migrate  # run migrations
nix run .#test        # tests
```

### Environment

The app runs out of the box against the local database with no extra config. A few features reach external services and degrade gracefully in development without their keys. Verification and invite emails print their links to the server terminal instead of sending, and CLI binary downloads are disabled. You only need those keys to exercise those specific flows.

## Self-hosting

The app ships as the [`itsasecret/web`](https://hub.docker.com/r/itsasecret/web) image on Docker Hub - multi-arch (amd64/arm64), built and pushed from `main` by CI. `deploy/` contains a turnkey compose bundle (app + Postgres 17, DB migrations run at every boot):

```sh
mkdir itsasecret && cd itsasecret
curl -O https://raw.githubusercontent.com/rockydotsystems/itsasecret-www/main/deploy/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/rockydotsystems/itsasecret-www/main/deploy/.env.example
# edit .env - POSTGRES_PASSWORD and SERVER_WRAP_SECRET are required
docker compose up -d
```

Then point the CLI at your instance: `shh config set url https://your.domain` (or a `url =` line in `.shh.project`). Email setup, reverse proxy, updates, and backups are covered in [`deploy/README.md`](deploy/README.md).

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Start the Vite dev server. |
| `pnpm build` | Production build. |
| `pnpm start` | Run the built server (`.output/server`). |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm test` | Run the vitest suite. |
| `pnpm db:generate` | Generate Drizzle migrations from the schema. |
| `pnpm db:migrate` | Apply migrations. |
| `pnpm db:push` | Push the schema directly (fast local iteration). |

## Project layout

```
src/
  router.tsx     TanStack Router instance
  start.ts       Server config (global middleware, background jobs)
  routes/        File-based routes
    api/         HTTP API endpoints (used by the web app and the CLI)
    *.tsx        Pages (landing, login, dashboard, docs, ...)
  lib/           Server + shared logic (db, auth, crypto, rbac, ...)
  components/    React UI components
  styles.css     Global design-system styles
drizzle/         Generated SQL migrations
```
