#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <chrome_extension_id>"
  exit 1
fi

EXTENSION_ID="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST_PATH="$ROOT_DIR/host/volume_host.py"
TEMPLATE_PATH="$ROOT_DIR/host/com.dunkadunka.volume_host.template.json"
TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
TARGET_FILE="$TARGET_DIR/com.dunkadunka.volume_host.json"

mkdir -p "$TARGET_DIR"
chmod +x "$HOST_PATH"

sed \
  -e "s|__HOST_PATH__|$HOST_PATH|g" \
  -e "s|__EXTENSION_ID__|$EXTENSION_ID|g" \
  "$TEMPLATE_PATH" > "$TARGET_FILE"

echo "Installed native host manifest at: $TARGET_FILE"
