#!/usr/bin/env python3
import json
import os
import platform
import re
import signal
import struct
import subprocess
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, Optional


HOST_NAME = "com.dunkadunka./opt/homebrew/bin/ffmpeg_demo_host"
ACTIVE_PIDS_BY_DEVICE: Dict[int, int] = {}
LAST_CAPTURE_PID: Optional[int] = None


def _run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _output_path(device_id: int) -> Path:
    return _project_root() / "video" / f"output_{device_id}.mp4"


def _sanitize_positive_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
    else:
        raise ValueError(f"{field_name} must be an integer")

    if parsed <= 0:
        raise ValueError(f"{field_name} must be > 0")
    return parsed


def _sanitize_non_negative_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
    else:
        raise ValueError(f"{field_name} must be an integer")

    if parsed < 0:
        raise ValueError(f"{field_name} must be >= 0")
    return parsed


def _sanitize_pix_fmt(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("pix_fmt must be a string")
    pix_fmt = value.strip()
    if not pix_fmt:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_]+", pix_fmt):
        raise ValueError("pix_fmt contains invalid characters")
    return pix_fmt


def _sanitize_duration_seconds(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError("duration_seconds must be a number")
    try:
        parsed = float(value)
    except (TypeError, ValueError) as err:
        raise ValueError("duration_seconds must be a number") from err
    if parsed <= 0:
        raise ValueError("duration_seconds must be > 0")
    return parsed


def _sanitize_filename(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("filename must be a string")

    name = value.strip()
    if not name:
        return None

    # Keep output filenames simple and safe under /video.
    if "/" in name or "\\" in name:
        raise ValueError("filename must not include path separators")

    if not re.fullmatch(r"[A-Za-z0-9._-]+", name):
        raise ValueError("filename contains invalid characters")

    if not name.lower().endswith(".mp4"):
        name = f"{name}.mp4"

    return name


def _sanitize_options(raw_options: Any) -> Dict[str, Any]:
    if raw_options is None:
        raw_options = {}
    if not isinstance(raw_options, dict):
        raise ValueError("options must be an object")

    width = _sanitize_positive_int(raw_options.get("width"), "width") if raw_options.get("width") is not None else None
    height = _sanitize_positive_int(raw_options.get("height"), "height") if raw_options.get("height") is not None else None
    if (width is None) != (height is None):
        raise ValueError("width and height must be provided together")

    crop = raw_options.get("crop")
    crop_filter = None
    if crop is not None:
        if not isinstance(crop, dict):
            raise ValueError("crop must be an object")
        crop_w = _sanitize_positive_int(crop.get("w"), "crop.w")
        crop_h = _sanitize_positive_int(crop.get("h"), "crop.h")
        crop_x = _sanitize_non_negative_int(crop.get("x", 0), "crop.x")
        crop_y = _sanitize_non_negative_int(crop.get("y", 0), "crop.y")
        crop_filter = f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}"

    return {
        "filename": _sanitize_filename(raw_options.get("filename")),
        "width": width,
        "height": height,
        "crop_filter": crop_filter,
        "pix_fmt": _sanitize_pix_fmt(raw_options.get("pix_fmt")),
        "duration_seconds": _sanitize_duration_seconds(raw_options.get("duration_seconds")),
    }


def _resolve_output_path(device_id: int, options: Dict[str, Any]) -> Path:
    file_name = options.get("filename") or f"output_{device_id}.mp4"
    return _project_root() / "video" / file_name


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

    result = _run(["/opt/homebrew/bin/ffmpeg", "-f", "avfoundation", "-list_devices", "true", "-i", ""])
    combined = "\n".join(p for p in [result.stdout, result.stderr] if p)

    parsed = _parse_devices(combined)
    return parsed


def start_capture(device_id: int, options: Dict[str, Any]) -> Dict[str, Any]:
    if platform.system() != "Darwin":
        raise RuntimeError("AVFoundation is supported on macOS only")

    output_file = _resolve_output_path(device_id, options)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "/opt/homebrew/bin/ffmpeg",
        "-y",
        "-f",
        "avfoundation",
    ]

    if options["width"] is not None and options["height"] is not None:
        cmd.extend(["-video_size", f"{options['width']}x{options['height']}"])

    cmd.extend(["-i", f"{device_id}:"])

    if options["crop_filter"] is not None:
        cmd.extend(["-vf", options["crop_filter"]])

    if options["pix_fmt"] is not None:
        cmd.extend(["-pix_fmt", options["pix_fmt"]])

    if options["duration_seconds"] is not None:
        cmd.extend(["-t", str(options["duration_seconds"])])

    cmd.append(str(output_file))

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        cwd=str(_project_root()),
    )

    global LAST_CAPTURE_PID
    ACTIVE_PIDS_BY_DEVICE[device_id] = process.pid
    LAST_CAPTURE_PID = process.pid

    return {
        "device_id": device_id,
        "pid": process.pid,
        "output_file": str(output_file),
        "command": " ".join(cmd),
    }


def stop_capture(command: Dict[str, Any]) -> Dict[str, Any]:
    pid_value = command.get("pid")
    if pid_value is not None:
        pid = _sanitize_positive_int(pid_value, "pid")
    else:
        device_id_value = command.get("device_id")
        if device_id_value is not None:
            device_id = _sanitize_device_id(device_id_value)
            pid = ACTIVE_PIDS_BY_DEVICE.get(device_id)
        else:
            pid = LAST_CAPTURE_PID

    if pid is None:
        return {"ok": False, "error": "No active capture process found"}

    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return {"ok": False, "error": f"Process {pid} is not running"}

    return {"ok": True, "pid": pid, "stopped": True}


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
        options = _sanitize_options(command.get("options"))
        started = start_capture(device_id, options)
        return {
            "ok": True,
            "device_id": started["device_id"],
            "pid": started["pid"],
            "output_file": started["output_file"],
            "command": started["command"],
        }

    if action == "stop_capture":
        return stop_capture(command)

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
