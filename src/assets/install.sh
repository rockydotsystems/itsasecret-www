#!/bin/sh
# itsasecret installer — https://itsasecret.dev/install.sh
#
#   curl -fsSL https://itsasecret.dev/install.sh | sh
#
# Installs the `itsasecret` CLI (and its `shh` alias) for linux/macOS on
# amd64/arm64. Override the target directory with SHH_INSTALL_DIR, or the
# server with SHH_BASE_URL (self-hosted).
set -eu

BASE_URL="${SHH_BASE_URL:-https://itsasecret.dev}"
INSTALL_DIR="${SHH_INSTALL_DIR:-$HOME/.local/bin}"

os=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$os" in
  linux | darwin) ;;
  *)
    echo "error: unsupported OS '$os' — the installer covers linux and macOS" >&2
    exit 1
    ;;
esac

arch=$(uname -m)
case "$arch" in
  x86_64 | amd64) arch=amd64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *)
    echo "error: unsupported architecture '$arch' — amd64 and arm64 only" >&2
    exit 1
    ;;
esac

bin="itsasecret_${os}_${arch}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $bin ..."
curl -fsSL "$BASE_URL/api/dl/$bin" -o "$tmp/itsasecret"
curl -fsSL "$BASE_URL/api/dl/checksums.txt" -o "$tmp/checksums.txt"

if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/itsasecret" | cut -d' ' -f1)
else
  actual=$(shasum -a 256 "$tmp/itsasecret" | cut -d' ' -f1)
fi
expected=$(awk -v f="$bin" '$2 == f { print $1 }' "$tmp/checksums.txt")
if [ -z "$expected" ] || [ "$actual" != "$expected" ]; then
  echo "error: checksum mismatch for $bin — aborting install" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
install -m 755 "$tmp/itsasecret" "$INSTALL_DIR/itsasecret"
ln -sf itsasecret "$INSTALL_DIR/shh"

version=$("$INSTALL_DIR/itsasecret" --version 2>/dev/null || echo "itsasecret")
echo "Installed $version to $INSTALL_DIR (alias: shh)"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo ""
    echo "note: $INSTALL_DIR is not on your PATH. Add it with:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac

echo "Get started: shh login"
