# Self-hosting itsasecret

Everything in this directory deploys your own itsasecret instance - the web
dashboard and HTTP API the `shh` CLI talks to - as two containers:

- `itsasecret/web` - the app (published to Docker Hub from the main repo)
- `postgres:17` - its database, keeping all state in a named volume

Secrets stay end-to-end encrypted exactly as on the hosted service: the stack
below only ever stores ciphertext.

## Quickstart

Only Docker is required.

```sh
mkdir itsasecret && cd itsasecret
curl -O https://raw.githubusercontent.com/rockydotsystems/itsasecret-www/main/deploy/docker-compose.yml
curl -o .env.example https://raw.githubusercontent.com/rockydotsystems/itsasecret-www/main/deploy/.env.example
cp .env.example .env
```

Edit `.env` - two values are required (`POSTGRES_PASSWORD`,
`SERVER_WRAP_SECRET`); the file explains how to generate them and covers the
optional email (Resend or log-delivery), billing, and CLI-download settings.

```sh
docker compose up -d
docker compose logs -f web   # first boot runs the database migrations
```

Open http://localhost:3000 and register the first account.

## Updates

```sh
docker compose pull
docker compose up -d
```

Database migrations run automatically at every boot.

## Reverse proxy

For real deployments put a TLS-terminating proxy (Caddy, nginx, Traefik) in
front and set `APP_URL=https://your.domain` in `.env`. If the chain has more
than one trusted proxy hop, adjust `TRUSTED_PROXY_COUNT` so rate limiting sees
client IPs correctly.

## Pointing the CLI at your instance

```sh
shh config set url https://your.domain
shh login
```

or commit a `url = https://your.domain` line to the repo's `.shh.project`
file so every checkout resolves to your server automatically.

## Backups

All state lives in the `pgdata` volume. A dump is sufficient:

```sh
docker compose exec postgres pg_dump -U itsasecret itsasecret > backup.sql
```

Back up the `.env` file alongside it - data wrapped under
`SERVER_WRAP_SECRET` is unrecoverable without it.
