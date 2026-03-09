#!/usr/bin/env python3
import json
import platform
import re
import shutil
import struct
import subprocess
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional

HOST_NAME = "com.dunkadunka.ffmpeg_controller"


def read_message() -> Optional[Dict[str, Any]]:
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    if len(raw_length) != 4:
        raise RuntimeError("Invalid native message header")

    message_length = struct.unpack("=I", raw_length)[0]
    payload = sys.stdin.buffer.read(message_length)
    if len(payload) != message_length:
        raise RuntimeError("Invalid native message payload")

    return json.loads(payload.decode("utf-8"))


def write_message(message: Dict[str, Any]) -> None:
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def output_dir() -> Path:
    path = project_root() / "output"
    path.mkdir(parents=True, exist_ok=True)
    return path


def ffmpeg_binary() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return "/opt/homebrew/bin/ffmpeg"
        raise RuntimeError("ffmpeg not found on PATH")
    return ffmpeg


def current_platform() -> str:
    return platform.system()


def require_supported_platform() -> str:
    system = current_platform()
    if system not in {"Darwin", "Linux"}:
        raise RuntimeError(f"Unsupported platform: {system}. Supported: Darwin, Linux")
    return system


def sanitize_non_negative_int(value: Any, field: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{field} must be an integer")
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
    else:
        raise ValueError(f"{field} must be an integer")

    if parsed < 0:
        raise ValueError(f"{field} must be >= 0")
    return parsed


def sanitize_positive_number(value: Any, field: str) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{field} must be a number")
    try:
        parsed = float(value)
    except (TypeError, ValueError) as err:
        raise ValueError(f"{field} must be a number") from err

    if parsed <= 0:
        raise ValueError(f"{field} must be > 0")
    return parsed


def sanitize_filename(value: Any, fallback_name: str) -> str:
    if value is None:
        return fallback_name
    if not isinstance(value, str):
        raise ValueError("output_file must be a string")

    name = value.strip()
    if not name:
        return fallback_name

    if "/" in name or "\\" in name:
        raise ValueError("output_file must not include path separators")

    if not re.fullmatch(r"[A-Za-z0-9._-]+", name):
        raise ValueError("output_file contains invalid characters")

    if not name.lower().endswith(".mp4"):
        name = f"{name}.mp4"

    return name


def parse_avfoundation_devices(ffmpeg_output: str) -> Dict[str, List[Dict[str, Any]]]:
    line_re = re.compile(r"\[(\d+)\]\s+(.+)$")
    video_devices: List[Dict[str, Any]] = []
    audio_devices: List[Dict[str, Any]] = []
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
        if not match or not section:
            continue

        item = {"id": int(match.group(1)), "name": match.group(2).strip()}
        if section == "video":
            video_devices.append(item)
        else:
            audio_devices.append(item)

    return {"video_devices": video_devices, "audio_devices": audio_devices}


def parse_linux_video_device_number(path: Path) -> Optional[int]:
    match = re.search(r"video(\d+)$", path.name)
    if not match:
        return None
    return int(match.group(1))


def linux_video_device_name(device_number: int) -> str:
    sys_name = Path(f"/sys/class/video4linux/video{device_number}/name")
    try:
        if sys_name.exists():
            return sys_name.read_text(encoding="utf-8").strip() or f"video{device_number}"
    except OSError:
        pass
    return f"video{device_number}"


def list_linux_video_devices() -> List[Dict[str, Any]]:
    devices: List[Dict[str, Any]] = []
    for path in sorted(Path("/dev").glob("video*")):
        number = parse_linux_video_device_number(path)
        if number is None:
            continue
        name = linux_video_device_name(number)
        devices.append({"id": number, "name": f"{name} ({path})", "path": str(path)})
    return devices


def list_linux_audio_devices() -> List[Dict[str, Any]]:
    # PulseAudio/PipeWire sources exposed via pactl are optional; return empty if unavailable.
    pactl = shutil.which("pactl")
    if not pactl:
        return []

    result = subprocess.run([pactl, "list", "short", "sources"], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return []

    devices: List[Dict[str, Any]] = []
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        source_name = parts[1].strip()
        if source_name:
            devices.append({"name": source_name})
    return devices


def list_devices() -> Dict[str, Any]:
    system = require_supported_platform()

    if system == "Darwin":
        cmd = [ffmpeg_binary(), "-f", "avfoundation", "-list_devices", "true", "-i", ""]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        combined = "\n".join(p for p in [result.stdout, result.stderr] if p)
        parsed = parse_avfoundation_devices(combined)
        return {
            "ok": True,
            "platform": system,
            "input_format": "avfoundation",
            "command": " ".join(cmd),
            "video_devices": parsed["video_devices"],
            "audio_devices": parsed["audio_devices"],
            "raw_output": combined,
        }

    video_devices = list_linux_video_devices()
    audio_devices = list_linux_audio_devices()
    return {
        "ok": True,
        "platform": system,
        "input_format": "v4l2",
        "video_devices": video_devices,
        "audio_devices": audio_devices,
    }


def record_for_duration(command: Dict[str, Any]) -> Dict[str, Any]:
    system = require_supported_platform()

    video_device_id = sanitize_non_negative_int(command.get("video_device_id"), "video_device_id")
    duration_seconds = sanitize_positive_number(command.get("duration_seconds"), "duration_seconds")

    default_name = f"capture_{video_device_id}_{int(duration_seconds)}s.mp4"
    output_file = sanitize_filename(command.get("output_file"), default_name)
    output_path = output_dir() / output_file

    if system == "Darwin":
        audio_device_id = command.get("audio_device_id")
        if audio_device_id is None:
            audio_input = "none"
        else:
            audio_input = str(sanitize_non_negative_int(audio_device_id, "audio_device_id"))

        cmd = [
            ffmpeg_binary(),
            "-y",
            "-r",
            "30",
            "-video_size",
            "1920x1080",
            "-f",
            "avfoundation",
            "-i",
            f"{video_device_id},0",
            "-t",
            str(duration_seconds),
            "-c:v",
            "libx264",
            "-crf",
            "0",
            "-preset",
            "ultrafast",
            str(output_path),
        ]
        print(cmd)
    else:
        video_device_path = command.get("video_device_path")
        if video_device_path is None:
            video_device = Path(f"/dev/video{video_device_id}")
        else:
            if not isinstance(video_device_path, str):
                raise ValueError("video_device_path must be a string")
            video_device = Path(video_device_path)

        if not str(video_device).startswith("/dev/video"):
            raise ValueError("video_device_path must start with /dev/video")
        if not video_device.exists():
            raise ValueError(f"Video device not found: {video_device}")

        cmd = [
            ffmpeg_binary(),
            "-y",
            "-f",
            "v4l2",
            "-i",
            str(video_device),
            "-t",
            str(duration_seconds),
            str(output_path),
        ]

        audio_source = command.get("audio_source")
        if audio_source is not None:
            if not isinstance(audio_source, str) or not audio_source.strip():
                raise ValueError("audio_source must be a non-empty string")
            cmd = [
                ffmpeg_binary(),
                "-y",
                "-f",
                "v4l2",
                "-i",
                str(video_device),
                "-f",
                "pulse",
                "-i",
                audio_source.strip(),
                "-t",
                str(duration_seconds),
                str(output_path),
            ]

    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return {
            "ok": False,
            "error": "ffmpeg recording failed",
            "command": " ".join(cmd),
            "stderr": result.stderr,
            "stdout": result.stdout,
            "return_code": result.returncode,
        }

    return {
        "ok": True,
        "platform": system,
        "command": " ".join(cmd),
        "output_file": str(output_path),
        "duration_seconds": duration_seconds,
        "video_device_id": video_device_id,
    }


def handle_command(command: Dict[str, Any]) -> Dict[str, Any]:
    action = command.get("action")

    if action == "ping":
        return {"ok": True, "host": HOST_NAME}

    if action == "list_devices":
        return list_devices()

    if action == "record_for_duration":
        return record_for_duration(command)

    return {"ok": False, "error": f"Unknown action: {action}"}


def main() -> None:
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
                    "error": str(err),
                    "traceback": traceback.format_exc(),
                }

            write_message(response)
    except Exception as err:
        write_message(
            {
                "ok": False,
                "error": str(err),
                "traceback": traceback.format_exc(),
            }
        )


if __name__ == "__main__":
    main()
