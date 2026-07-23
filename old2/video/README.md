# Video FFmpeg Extension (From Scratch)

This folder contains a full Chrome Native Messaging setup that can:

- list video devices on:
  - macOS via AVFoundation (`ffmpeg -f avfoundation -list_devices true -i ""`)
  - Linux via `/dev/video*` discovery (`v4l2` capture input)
- record for a fixed duration using FFmpeg

## Structure

- `extension/` Manifest V3 Chrome extension
- `host/` Python native messaging host
- `scripts/register-macos.sh` Registers native host in Chrome on macOS
- `scripts/register-linux.sh` Registers native host in Chrome on Linux
- `output/` Recording output directory
- `index.html` Optional web page demo that uses extension bridge

## Requirements

- macOS or Linux
- Google Chrome
- Python 3.9+
- FFmpeg on PATH

## Setup

1. Load extension:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked** and select `video/extension`
   - Copy extension ID
2. Register native host:

```bash
cd video
chmod +x host/ffmpeg_host.py scripts/register-macos.sh scripts/register-linux.sh
# macOS
./scripts/register-macos.sh <EXTENSION_ID>
# Linux
./scripts/register-linux.sh <EXTENSION_ID>
```

3. Reload the extension.

## Popup actions

- `List Devices`: Calls native host action `list_devices`
- `Record For Duration`: Calls `record_for_duration` with:
  - `video_device_id`
  - `duration_seconds`
  - optional `output_file`

Recorded files are written under `video/output/`.

## Native host commands

### list devices

```json
{ "action": "list_devices" }
```

### record for duration

```json
{
  "action": "record_for_duration",
  "video_device_id": 0,
  "duration_seconds": 5,
  "output_file": "demo.mp4"
}
```

Platform notes:

- macOS: optional `audio_device_id` can be used with AVFoundation (`video_id:audio_id`)
- Linux: uses `v4l2` video input from `/dev/video*`; optional `audio_source` can be passed for PulseAudio/PipeWire source capture
