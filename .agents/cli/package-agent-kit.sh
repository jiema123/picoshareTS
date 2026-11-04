#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
VERSION=$(cat "$SCRIPT_DIR/VERSION")
CLI_VERSION=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version)' "$ROOT_DIR/.agents/cli/package.json")
SKILL_VERSION=$(awk '/^version:/{print $2; exit}' "$ROOT_DIR/.agents/skills/picoshare/SKILL.md")
PACKAGE_NAME="picoshare-agent-kit-v$VERSION"
DOWNLOADS_DIR="$ROOT_DIR/public/downloads"
STAGING_DIR=$(mktemp -d "${TMPDIR:-/tmp}/picoshare-agent-kit.XXXXXX")
PACKAGE_DIR="$STAGING_DIR/$PACKAGE_NAME"
LANDING_SOURCE="$ROOT_DIR/src/pages/landing.ts"

for artifact in "$PACKAGE_NAME.zip" "$PACKAGE_NAME.tar.gz" "picoshare-ai-prompts-v$VERSION.md"; do
  if ! grep -Fq "/downloads/$artifact" "$LANDING_SOURCE"; then
    echo "Error: landing page does not link to /downloads/$artifact" >&2
    exit 1
  fi
done
if ! grep -Fq '/install.sh' "$ROOT_DIR/src/pages/api-docs.ts"; then
  echo "Error: API docs do not include the CLI install command." >&2
  exit 1
fi

cleanup() { rm -rf "$STAGING_DIR"; }
trap cleanup EXIT HUP INT TERM

mkdir -p "$PACKAGE_DIR/.agents/cli" "$PACKAGE_DIR/.agents/skills"
cp -R "$ROOT_DIR/.agents/cli/bin" "$PACKAGE_DIR/.agents/cli/"
cp -R "$ROOT_DIR/.agents/cli/src" "$PACKAGE_DIR/.agents/cli/"
cp "$ROOT_DIR/.agents/cli/package.json" "$ROOT_DIR/.agents/cli/package-lock.json" \
  "$ROOT_DIR/.agents/cli/install.sh" "$ROOT_DIR/.agents/cli/VERSION" "$PACKAGE_DIR/.agents/cli/"
cp -R "$ROOT_DIR/.agents/skills/picoshare" "$PACKAGE_DIR/.agents/skills/"
cp "$ROOT_DIR/.agents/cli/AGENT_KIT_README.md" "$PACKAGE_DIR/README.md"
cp "$ROOT_DIR/docs/picoshare-ai-prompts.md" "$PACKAGE_DIR/PROMPTS.md"

cat > "$PACKAGE_DIR/install.sh" <<'EOF'
#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$SCRIPT_DIR/.agents/cli/install.sh" "$@"
EOF
chmod +x "$PACKAGE_DIR/install.sh" "$PACKAGE_DIR/.agents/cli/install.sh" \
  "$PACKAGE_DIR/.agents/cli/bin/picoshare" "$PACKAGE_DIR/.agents/cli/bin/picoshare.mjs"

cat > "$PACKAGE_DIR/manifest.json" <<EOF
{
  "name": "picoshare-agent-kit",
  "version": "$VERSION",
  "cli": "$CLI_VERSION",
  "skill": "picoshare@$SKILL_VERSION",
  "node": ">=20",
  "contents": [".agents/cli", ".agents/skills/picoshare", "PROMPTS.md", "README.md"]
}
EOF

mkdir -p "$DOWNLOADS_DIR"
ZIP_PATH="$DOWNLOADS_DIR/$PACKAGE_NAME.zip"
TGZ_PATH="$DOWNLOADS_DIR/$PACKAGE_NAME.tar.gz"
PROMPTS_PATH="$DOWNLOADS_DIR/picoshare-ai-prompts-v$VERSION.md"
LATEST_TGZ_PATH="$DOWNLOADS_DIR/picoshare-agent-kit-latest.tar.gz"
rm -f "$ZIP_PATH" "$TGZ_PATH"
(cd "$STAGING_DIR" && zip -qr "$ZIP_PATH" "$PACKAGE_NAME")
tar -czf "$TGZ_PATH" -C "$STAGING_DIR" "$PACKAGE_NAME"
cp "$ROOT_DIR/docs/picoshare-ai-prompts.md" "$PROMPTS_PATH"
cp "$TGZ_PATH" "$LATEST_TGZ_PATH"
cp "$SCRIPT_DIR/install-bootstrap.sh" "$ROOT_DIR/public/install.sh"
chmod +x "$ROOT_DIR/public/install.sh"

unzip -l "$ZIP_PATH" | grep -q "$PACKAGE_NAME/.agents/skills/picoshare/SKILL.md"
tar -tzf "$TGZ_PATH" | grep -q "$PACKAGE_NAME/.agents/skills/picoshare/SKILL.md"
echo "Built: $ZIP_PATH"
echo "Built: $TGZ_PATH"
echo "Built: $LATEST_TGZ_PATH"
echo "Built: $ROOT_DIR/public/install.sh"
echo "Built: $PROMPTS_PATH"
