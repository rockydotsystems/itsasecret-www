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
            packages = [ node pkgs.git ];
            shellHook = ''
              echo ""
              echo "itsasecret-www dev shell"
              echo "  npm install        # first-time setup"
              echo "  npm run dev        # vite dev (local)"
              echo "  npm run test       # vitest"
              echo "  npm run typecheck  # tsc --noEmit"
              echo "  npm run db:apply   # apply migrations"
              echo ""
            '';
          };
        });

      apps = forAll (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          node = pkgs.nodejs_22;
          nodeBin = pkgs.lib.makeBinPath [ node ];
          app = name: cmd: {
            type = "app";
            program = toString (pkgs.writeShellScript name ''
              export PATH="${nodeBin}:$PATH"
              [ -d node_modules ] || npm install
              exec ${cmd}
            '');
          };
        in {
          dev = app "dev" ''npx vite dev "$@"'';
          test = app "test" ''npx vitest run "$@"'';
          typecheck = app "typecheck" ''npx tsc --noEmit'';
          db-apply = app "db-apply" ''npx tsx src/lib/migrate.ts "$@"'';
        });
    };
}
