#!/usr/bin/env bash
# Start a Claude Code session wired to fictional Linear data, for recording demos.
#
# It resets a scratch copy of the acme-shop fixture repo (the code the mock tickets talk
# about) and starts claude there. --strict-mcp-config drops every other MCP server
# (including the real Linear plugin's), and the mock registers under the real plugin's
# name, so the mod and Claude both use it with no config changes. Extra arguments pass
# through to claude.
set -euo pipefail

export CLAUDE_DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CLAUDE_CODE_PLUGIN_DIRS="$(dirname "$CLAUDE_DEMO_DIR")"
WORKSPACE="${DEMO_WORKSPACE:-$HOME/acme-shop}"

# Only ever replace a directory this script created.
if [[ -e "$WORKSPACE" && ! -e "$WORKSPACE/.acme-demo" ]]; then
  echo "$WORKSPACE exists and isn't a demo workspace; set DEMO_WORKSPACE to another path." >&2
  exit 1
fi
rm -rf "$WORKSPACE"
cp -R "$CLAUDE_DEMO_DIR/acme-shop" "$WORKSPACE"
touch "$WORKSPACE/.acme-demo"
printf '.acme-demo\n' > "$WORKSPACE/.gitignore"
git -C "$WORKSPACE" init -q
git -C "$WORKSPACE" add -A
git -C "$WORKSPACE" -c user.name=Demo -c user.email=demo@acme.dev commit -qm 'Initial commit'

cd "$WORKSPACE"
exec claude --mcp-config "$CLAUDE_DEMO_DIR/mcp.json" --strict-mcp-config "$@"
