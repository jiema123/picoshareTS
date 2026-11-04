#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: install.sh [--global | --local]

  --global  Install the CLI in the versioned PicoShare release directory and
            register `picoshare` globally (default)
  --local   Install dependencies in this package directory without global linking
EOF
}

MODE=global
case "${1:-}" in
  ""|--global) MODE=global ;;
  --local) MODE=local ;;
  --help|-h) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac
if [ "$#" -gt 1 ]; then usage >&2; exit 2; fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
VERSION=$(cat "$SCRIPT_DIR/VERSION")
SKILL_SOURCE="$PACKAGE_ROOT/.agents/skills/picoshare"
PROMPTS_SOURCE="$PACKAGE_ROOT/PROMPTS.md"
if [ ! -f "$PROMPTS_SOURCE" ]; then PROMPTS_SOURCE="$PACKAGE_ROOT/docs/picoshare-ai-prompts.md"; fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 20 or newer is required." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required to install the PicoShare CLI dependency." >&2
  exit 1
fi
NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
case "$NODE_MAJOR" in
  ''|*[!0-9]*) echo "Error: could not determine the Node.js version." >&2; exit 1 ;;
esac
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js 20 or newer is required (found $(node --version))." >&2
  exit 1
fi
if [ ! -f "$SKILL_SOURCE/SKILL.md" ]; then
  echo "Error: bundled PicoShare Skill was not found at $SKILL_SOURCE." >&2
  exit 1
fi

if [ "$MODE" = global ]; then
  INSTALL_ROOT=${PICOSHARE_INSTALL_ROOT:-"$HOME/.local/share/picoshare"}
  RELEASE_DIR="$INSTALL_ROOT/releases/$VERSION"
  mkdir -p "$RELEASE_DIR/.agents/cli" "$RELEASE_DIR/.agents/skills"
  cp -R "$PACKAGE_ROOT/.agents/cli/." "$RELEASE_DIR/.agents/cli/"
  cp -R "$SKILL_SOURCE" "$RELEASE_DIR/.agents/skills/"
  if [ -f "$PROMPTS_SOURCE" ]; then cp "$PROMPTS_SOURCE" "$RELEASE_DIR/PROMPTS.md"; fi
  CLI_DIR="$RELEASE_DIR/.agents/cli"
  SKILL_DIR="$RELEASE_DIR/.agents/skills/picoshare"
else
  CLI_DIR="$SCRIPT_DIR"
  SKILL_DIR="$SKILL_SOURCE"
fi

echo "Installing PicoShare CLI dependencies..."
cd "$CLI_DIR"
npm ci --ignore-scripts --no-audit --no-fund

if [ "$MODE" = global ]; then
  NPM_PREFIX=$(npm prefix --global)
  GLOBAL_COMMAND="$NPM_PREFIX/bin/picoshare"
  if EXISTING_COMMAND=$(command -v picoshare 2>/dev/null); then
    EXISTING_ENTRY=$(node -e 'try { console.log(require("fs").realpathSync(process.argv[1])) } catch {}' "$EXISTING_COMMAND")
    EXPECTED_COMMAND=$(node -e 'try { console.log(require("fs").realpathSync(process.argv[1])) } catch {}' "$GLOBAL_COMMAND")
    if [ -z "$EXPECTED_COMMAND" ] || [ "$EXISTING_ENTRY" != "$EXPECTED_COMMAND" ]; then
      echo "Error: another picoshare command is already on PATH: $EXISTING_COMMAND" >&2
      echo "Remove the existing command before installing this release." >&2
      exit 1
    fi
  fi
  echo "Registering the picoshare command with npm..."
  npm install --global --ignore-scripts --no-audit --no-fund "$CLI_DIR"
fi

install_skill() {
  TARGET_ROOT=$1
  TARGET_DIR="$TARGET_ROOT/picoshare"
  mkdir -p "$TARGET_DIR"
  cp -R "$SKILL_DIR/." "$TARGET_DIR/"
  if [ ! -f "$TARGET_DIR/SKILL.md" ]; then
    echo "Error: Skill installation verification failed: $TARGET_DIR/SKILL.md" >&2
    exit 1
  fi
  echo "Installed PicoShare Skill: $TARGET_DIR"
}

install_skill "$HOME/.agents/skills"
install_skill "$HOME/.codex/skills"
install_skill "$HOME/.claude/skills"
install_skill "$HOME/.hermes/skills"
install_skill "$HOME/.config/opencode/skills"
install_skill "$HOME/.openclaw/skills"
install_skill "$HOME/.config/openclaw/skills"

"$CLI_DIR/bin/picoshare.mjs" --help >/dev/null
if [ "$MODE" = global ]; then
  if command -v picoshare >/dev/null 2>&1; then
    picoshare --help >/dev/null
  else
    echo "The npm global bin directory may not be on PATH: $NPM_PREFIX/bin" >&2
  fi
  echo "Installed PicoShare CLI v$VERSION and Skill. Set PICOSHARE_BASE_URL and PICOSHARE_API_KEY before using API commands."
else
  echo "Installed locally. Run: $CLI_DIR/bin/picoshare --help"
  echo "Set PICOSHARE_BASE_URL and PICOSHARE_API_KEY before using API commands."
fi
