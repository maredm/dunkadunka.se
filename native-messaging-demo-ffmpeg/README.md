# Native Messaging Demo FFmpeg

Standalone demo for Chrome Native Messaging + FFmpeg (AVFoundation on macOS).

## Folders

- `extension/` Chrome extension (Manifest V3)
- `host/` Python native host + host manifest template
- `scripts/` registration script for macOS
- `web/` demo webpage that uses the extension bridge

## Requirements

- macOS
- Python 3.9+
- FFmpeg with AVFoundation support
- Google Chrome

## What the host runs

- Device listing:

```bash
ffmpeg -f avfoundation -list_devices true -i ""
```

- Capture start for selected device ID:

```bash
ffmpeg -y -f avfoundation -i "<device_id>:" video/output_<device_id>.mp4
```

Supported start options:

- `filename` (e.g. `session_01.mp4`)
- `width` + `height`
- `crop` object: `w`, `h`, `x`, `y` (mapped to FFmpeg `-vf crop=...`)
- `pix_fmt`
- `duration_seconds`

Stop action:

- `stop_capture` with optional `pid` or `device_id`

## Setup

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and choose `native-messaging-demo-ffmpeg/extension`
4. Copy extension ID
5. Register native host:

```bash
cd native-messaging-demo-ffmpeg
chmod +x host/ffmpeg_host.py scripts/register-macos.sh
./scripts/register-macos.sh <EXTENSION_ID>
```

6. Reload extension
7. Enable **Allow access to file URLs** for the extension

## Use from webpage

1. Open `native-messaging-demo-ffmpeg/web/index.html` in Chrome
2. Click **List Devices**
3. Choose a video device
4. Click **Start Capture**

Output is written to `video/output_<device_id>.mp4`.
