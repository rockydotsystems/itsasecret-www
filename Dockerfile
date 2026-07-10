# syntax=docker/dockerfile:1

# --- base: Node 22 + pnpm 10 (lockfile is v9) ---
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10 --activate

# --- build: install all deps, run vite/nitro build ---
FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# --- runner: Nitro .output is self-contained (bundles its own node_modules) ---
FROM base AS runner
RUN useradd --system --create-home --uid 1001 appuser
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build --chown=appuser:appuser /app/.output ./.output
# Migration SQL + journal for the boot-time migrator (MIGRATE_ON_BOOT)
COPY --from=build --chown=appuser:appuser /app/drizzle ./drizzle
USER appuser
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
