{
  description = "itsasecret — TanStack Start API + website";

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
            packages = [ node pkgs.pnpm pkgs.git ];
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
            '';
          };
        });

      apps = forAll (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          node = pkgs.nodejs_22;
          bin = pkgs.lib.makeBinPath [ node pkgs.pnpm ];
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
        in {
          db = dbApp;
          db-stop = rawApp "db-stop" ''docker compose down "$@"'';
          dev = app "dev" ''pnpm exec vite dev "$@"'';
          test = app "test" ''pnpm exec vitest run "$@"'';
          typecheck = app "typecheck" ''pnpm exec tsc --noEmit'';
          db-push = app "db-push" ''pnpm exec drizzle-kit push "$@"'';
          db-migrate = app "db-migrate" ''pnpm exec drizzle-kit migrate "$@"'';
          db-generate = app "db-generate" ''pnpm exec drizzle-kit generate "$@"'';
        });
    };
}
