#!/usr/bin/env python3
import json
import platform
import re
import struct
import subprocess
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, Optional


HOST_NAME = "com.dunkadunka.ffmpeg_demo_host"


def _run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _output_path(device_id: int) -> Path:
    return _project_root() / "video" / f"output_{device_id}.mp4"


def _sanitize_device_id(value: Any) -> int:
    if isinstance(value, bool):
        raise ValueError("device_id must be an integer")
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
    else:
        raise ValueError("device_id must be an integer")

    if parsed < 0:
        raise ValueError("device_id must be >= 0")
    return parsed


def _parse_devices(ffmpeg_output: str) -> Dict[str, Any]:
    line_re = re.compile(r"\[(\d+)\]\s+(.+)$")
    video_devices = []
    audio_devices = []
    section = None

    for raw_line in ffmpeg_output.splitlines():
        line = raw_line.strip()

        if "AVFoundation video devices" in line:
            section = "video"
            continue
        if "AVFoundation audio devices" in line:
            section = "audio"
            continue

        match = line_re.search(line)
        if not match or section is None:
            continue

        item = {"id": int(match.group(1)), "name": match.group(2).strip()}
        if section == "video":
            video_devices.append(item)
        else:
            audio_devices.append(item)

    return {"video_devices": video_devices, "audio_devices": audio_devices}


def list_devices() -> Dict[str, Any]:
    if platform.system() != "Darwin":
        raise RuntimeError("AVFoundation is supported on macOS only")

    result = _run(["ffmpeg", "-f", "avfoundation", "-list_devices", "true", "-i", ""])
    combined = "\n".join(p for p in [result.stdout, result.stderr] if p)

    if result.returncode not in (0, 1):
        raise RuntimeError(combined.strip() or "ffmpeg failed")

    parsed = _parse_devices(combined)
    return parsed


def start_capture(device_id: int) -> Dict[str, Any]:
    if platform.system() != "Darwin":
        raise RuntimeError("AVFoundation is supported on macOS only")

    output_file = _output_path(device_id)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # Device-specific AVFoundation input based on selected id.
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "avfoundation",
        "-i",
        f"{device_id}:",
        str(output_file),
    ]

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        cwd=str(_project_root()),
    )

    return {
        "device_id": device_id,
        "pid": process.pid,
        "output_file": str(output_file),
        "command": " ".join(cmd),
    }


def read_message() -> Optional[Dict[str, Any]]:
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    if len(raw_length) != 4:
        raise RuntimeError("Invalid message header")

    message_length = struct.unpack("=I", raw_length)[0]
    payload = sys.stdin.buffer.read(message_length)
    if len(payload) != message_length:
        raise RuntimeError("Invalid message payload")

    return json.loads(payload.decode("utf-8"))


def write_message(message: Dict[str, Any]):
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def handle_command(command: Dict[str, Any]) -> Dict[str, Any]:
    action = command.get("action")

    if action == "ping":
        return {"ok": True, "host": HOST_NAME}

    if action == "list_devices":
        devices = list_devices()
        return {
            "ok": True,
            "video_devices": devices["video_devices"],
            "audio_devices": devices["audio_devices"],
        }

    if action == "start_capture":
        device_id = _sanitize_device_id(command.get("device_id"))
        started = start_capture(device_id)
        return {
            "ok": True,
            "device_id": started["device_id"],
            "pid": started["pid"],
            "output_file": started["output_file"],
            "command": started["command"],
        }

    return {"ok": False, "error": f"Unknown action: {action}"}


def main():
    try:
        while True:
            message = read_message()
            if message is None:
                break

            try:
                response = handle_command(message)
            except Exception as err:
                response = {
                    "ok": False,
                    "error": f"{err}\n{traceback.format_exc()}".strip(),
                }

            write_message(response)
    except Exception as err:
        write_message({
            "ok": False,
            "error": f"{err}\n{traceback.format_exc()}".strip(),
        })


if __name__ == "__main__":
    main()
