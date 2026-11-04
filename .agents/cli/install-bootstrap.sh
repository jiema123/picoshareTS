#!/bin/sh
set -eu

if [ "$#" -gt 1 ]; then
  echo 'Usage: curl -fsSL "https://<your-domain>/install.sh" | sh -s -- "https://<your-domain>"' >&2
  exit 2
fi

BASE_URL=${1:-${PICOSHARE_BASE_URL:-}}
if [ -z "$BASE_URL" ]; then
  echo 'Pass the PicoShare site URL as the first argument or set PICOSHARE_BASE_URL.' >&2
  exit 2
fi
case "$BASE_URL" in
  http://*|https://*) ;;
  *) echo "PICOSHARE_BASE_URL must start with http:// or https://." >&2; exit 2 ;;
esac
BASE_URL=${BASE_URL%/}

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required to download the PicoShare CLI package." >&2
  exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
  echo "Error: tar is required to unpack the PicoShare CLI package." >&2
  exit 1
fi

TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/picoshare-install.XXXXXX")
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT HUP INT TERM

ARCHIVE="$TEMP_DIR/picoshare-agent-kit-latest.tar.gz"
echo "Downloading PicoShare CLI + Skill from $BASE_URL..."
curl --fail --silent --show-error --location \
  "$BASE_URL/downloads/picoshare-agent-kit-latest.tar.gz" \
  --output "$ARCHIVE"
tar -xzf "$ARCHIVE" -C "$TEMP_DIR"

set -- "$TEMP_DIR"/picoshare-agent-kit-v*
if [ ! -d "$1" ] || [ ! -f "$1/install.sh" ]; then
  echo "Error: the downloaded archive does not contain the PicoShare installer." >&2
  exit 1
fi

sh "$1/install.sh"
