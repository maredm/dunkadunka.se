#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <EXTENSION_ID>"
  exit 1
fi

EXTENSION_ID="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST_SCRIPT="$VIDEO_ROOT/host/ffmpeg_host.py"
TEMPLATE="$VIDEO_ROOT/host/com.dunkadunka.ffmpeg_controller.template.json"
OUTPUT_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
OUTPUT_FILE="$OUTPUT_DIR/com.dunkadunka.ffmpeg_controller.json"

mkdir -p "$OUTPUT_DIR"
chmod +x "$HOST_SCRIPT"

escaped_host_script=$(printf '%s' "$HOST_SCRIPT" | sed 's/[\/&]/\\&/g')

sed \
  -e "s/__EXTENSION_ID__/$EXTENSION_ID/g" \
  -e "s/__HOST_SCRIPT_PATH__/$escaped_host_script/g" \
  "$TEMPLATE" > "$OUTPUT_FILE"

echo "Registered native host: $OUTPUT_FILE"
