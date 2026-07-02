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
              echo "  pnpm install        # first-time setup"
              echo "  pnpm dev            # vite dev (local)"
              echo "  pnpm test           # vitest"
              echo "  pnpm typecheck      # tsc --noEmit"
              echo "  pnpm db:push        # push schema to Postgres"
              echo "  pnpm db:migrate     # run drizzle-kit migrations"
              echo "  pnpm db:generate    # generate drizzle-kit migrations"
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
        in {
          dev = app "dev" ''pnpm exec vite dev "$@"'';
          test = app "test" ''pnpm exec vitest run "$@"'';
          typecheck = app "typecheck" ''pnpm exec tsc --noEmit'';
          db-push = app "db-push" ''pnpm exec drizzle-kit push "$@"'';
          db-migrate = app "db-migrate" ''pnpm exec drizzle-kit migrate "$@"'';
          db-generate = app "db-generate" ''pnpm exec drizzle-kit generate "$@"'';
        });
    };
}
