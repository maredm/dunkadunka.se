# Native Messaging Volume Demo

This demo shows how a Chrome extension can send commands to a local native process that changes OS output volume.

## What this includes

- `extension/` — Chrome extension (Manifest V3)
- `host/volume_host.py` — native messaging host (Python 3)
- `host/com.dunkadunka.volume_host.template.json` — host manifest template
- `scripts/register-linux.sh` — Linux registration script
- `scripts/register-macos.sh` — macOS registration script
- `scripts/register-windows.ps1` — Windows registration script

## Safety

This demo intentionally exposes only three actions:

- `get_volume`
- `set_volume`
- `change_volume`

No shell command text is accepted from the extension.

## Prerequisites

- Google Chrome
- Python 3 on PATH
- OS mixer tool:
  - Linux: `pactl` (preferred) or `amixer`
  - macOS: `osascript`
  - Windows: `powershell`

## Setup

1. Open Chrome extension page: `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `native-messaging-demo/extension`
4. Copy the generated extension ID

### Linux

```bash
cd native-messaging-demo
chmod +x host/volume_host.py scripts/register-linux.sh
./scripts/register-linux.sh <EXTENSION_ID>
```

### macOS

```bash
cd native-messaging-demo
chmod +x host/volume_host.py scripts/register-macos.sh
./scripts/register-macos.sh <EXTENSION_ID>
```

### Windows (PowerShell)

```powershell
cd native-messaging-demo
powershell -ExecutionPolicy Bypass -File .\scripts\register-windows.ps1 -ExtensionId <EXTENSION_ID>
```

Then click **Reload** on the extension in `chrome://extensions`.

## Test

1. Click the extension toolbar icon
2. Click **Get Current Volume**
3. Try **+10%**, **-10%**, or slider + **Set Volume**

If registration is correct, the popup should show the current volume after each action.

## Control from three-channel-router.html

You can also control OS volume directly from `three-channel-router.html`.

1. Open `chrome://extensions`
2. For **Native Volume Messaging Demo**, enable **Allow access to file URLs** (required when opening local HTML files)
3. Open `three-channel-router.html` in Chrome
4. Use the **OS output volume** section to get/set/change system volume

If the page shows "Native volume bridge unavailable", verify the extension is loaded and re-open the page.

## Troubleshooting

- `Specified native messaging host not found`:
  - Verify the manifest path and extension ID substitutions are correct.
  - Reload extension after running the register script.
- Linux command errors:
  - Install `pulseaudio-utils` (for `pactl`) or `alsa-utils` (for `amixer`).
- Python not found:
  - Ensure `#!/usr/bin/env python3` resolves on your machine.
