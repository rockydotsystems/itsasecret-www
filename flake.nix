{
  description = "itsasecret - TanStack Start API + website";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAll = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAll (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          node = pkgs.nodejs_22;
        in {
          default = pkgs.mkShell {
            packages = [ node pkgs.pnpm pkgs.git pkgs.railway ];
            shellHook = ''
              echo ""
              echo "itsasecret-www dev shell"
              echo ""
              echo "pnpm:"
              echo "  pnpm install             # first-time setup"
              echo "  pnpm dev                 # vite dev (local)"
              echo "  pnpm test                # vitest"
              echo "  pnpm typecheck           # tsc --noEmit"
              echo "  pnpm db:push             # push schema to Postgres"
              echo "  pnpm db:migrate          # run drizzle-kit migrations"
              echo "  pnpm db:generate         # generate drizzle-kit migrations"
              echo ""
              echo "nix apps:"
              echo "  nix run .#db             # start Postgres (docker compose up -d)"
              echo "  nix run .#db-stop        # stop Postgres"
              echo "  nix run .#dev            # vite dev"
              echo "  nix run .#test           # vitest"
              echo "  nix run .#typecheck      # tsc --noEmit"
              echo "  nix run .#db-push        # drizzle-kit push"
              echo "  nix run .#db-migrate     # drizzle-kit migrate"
              echo "  nix run .#db-generate    # drizzle-kit generate"
              echo ""
              echo "deploy (railway):"
              echo "  railway login            # first-time auth (opens browser)"
              echo "  nix run .#deploy         # railway up"
              echo "  nix run .#migrate-prod   # railway run pnpm db:migrate"
              echo ""
            '';
          };
        });

      apps = forAll (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          node = pkgs.nodejs_22;
          bin = pkgs.lib.makeBinPath [ node pkgs.pnpm pkgs.railway ];
          app = name: cmd: {
            type = "app";
            program = toString (pkgs.writeShellScript name ''
              export PATH="${bin}:$PATH"
              [ -d node_modules ] || pnpm install
              exec ${cmd}
            '');
          };
          rawApp = name: cmd: {
            type = "app";
            program = toString (pkgs.writeShellScript name ''
              exec ${cmd}
            '');
          };
          dbApp = {
            type = "app";
            program = toString (pkgs.writeShellScript "db" ''
              docker compose up -d postgres "$@"
              echo "waiting for postgres to be ready..."
              for _ in $(seq 1 30); do
                if docker compose exec postgres pg_isready -U itsasecret -d itsasecret >/dev/null 2>&1; then
                  echo "postgres is ready"
                  exit 0
                fi
                sleep 1
              done
              echo "postgres did not become ready within 30s" >&2
              exit 1
            '');
          };
          # Own script (not the `app` helper) - the helper does `exec ${cmd}`,
          # which only works for a single command, not this multi-line body.
          migrateProdApp = {
            type = "app";
            program = toString (pkgs.writeShellScript "migrate-prod" ''
              export PATH="${bin}:$PATH"
              [ -d node_modules ] || pnpm install
              DB="$(railway variables --service Postgres --kv | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=s.split(String.fromCharCode(10)).find(l=>l.startsWith("DATABASE_PUBLIC_URL="));process.stdout.write(m?m.slice(20):"")})')"
              [ -n "$DB" ] || { echo "could not read DATABASE_PUBLIC_URL from Postgres service" >&2; exit 1; }
              DATABASE_URL="$DB" pnpm exec drizzle-kit migrate
            '');
          };
        in {
          db = dbApp;
          db-stop = rawApp "db-stop" ''docker compose down "$@"'';
          dev = app "dev" ''pnpm exec vite dev "$@"'';
          test = app "test" ''pnpm exec vitest run "$@"'';
          typecheck = app "typecheck" ''pnpm exec tsc --noEmit'';
          db-push = app "db-push" ''pnpm exec drizzle-kit push "$@"'';
          db-migrate = app "db-migrate" ''pnpm exec drizzle-kit migrate "$@"'';
          db-generate = app "db-generate" ''pnpm exec drizzle-kit generate "$@"'';
          deploy = app "deploy" ''railway up "$@"'';
          # `railway run` injects the web service's DATABASE_URL, which is the
          # INTERNAL domain (postgres.railway.internal) - unresolvable off
          # Railway, so it hangs. migrateProdApp instead pulls the Postgres
          # service's public proxy URL and hands it to drizzle-kit directly.
          # No hardcoded creds; survives password rotation.
          migrate-prod = migrateProdApp;
        });
    };
}
