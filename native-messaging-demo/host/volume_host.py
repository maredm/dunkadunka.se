#!/usr/bin/env python3
import json
import platform
import re
import struct
import subprocess
import sys
from typing import Any, Dict


def _run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def _clamp(value: int) -> int:
    return max(0, min(100, value))


def _parse_percent(text: str) -> int:
    match = re.search(r"(\d{1,3})%", text)
    if not match:
        raise RuntimeError(f"Could not parse volume percent from: {text!r}")
    return _clamp(int(match.group(1)))


def _linux_get_volume() -> int:
    pactl = _run(["pactl", "get-sink-volume", "@DEFAULT_SINK@"])
    if pactl.returncode == 0 and pactl.stdout:
      return _parse_percent(pactl.stdout)

    amixer = _run(["amixer", "get", "Master"])
    if amixer.returncode == 0 and amixer.stdout:
      return _parse_percent(amixer.stdout)

    raise RuntimeError("No supported Linux mixer found (tried pactl and amixer)")


def _linux_set_volume(value: int) -> int:
    value = _clamp(value)
    pactl = _run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{value}%"])
    if pactl.returncode == 0:
      return _linux_get_volume()

    amixer = _run(["amixer", "set", "Master", f"{value}%"])
    if amixer.returncode == 0:
      return _linux_get_volume()

    raise RuntimeError("Failed to set Linux volume (tried pactl and amixer)")


def _mac_get_volume() -> int:
    result = _run(["osascript", "-e", "output volume of (get volume settings)"])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "osascript failed")
    return _clamp(int(result.stdout.strip()))


def _mac_set_volume(value: int) -> int:
    value = _clamp(value)
    result = _run(["osascript", "-e", f"set volume output volume {value}"])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "osascript failed")
    return _mac_get_volume()


def _win_volume_script() -> str:
    return r'''
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int NotImpl1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr pNotify);
  int UnregisterControlChangeNotify(IntPtr pNotify);
  int GetChannelCount(out uint pnChannelCount);
  int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int GetMasterVolumeLevel(out float pfLevelDB);
  int GetMasterVolumeLevelScalar(out float pfLevel);
}

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
class MMDeviceEnumeratorComObject {}

public static class WinVolume {
  public static IAudioEndpointVolume GetVolumeObject() {
    IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice device;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume volume;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out volume));
    return volume;
  }

  public static int GetVolumePercent() {
    float level;
    Marshal.ThrowExceptionForHR(GetVolumeObject().GetMasterVolumeLevelScalar(out level));
    return (int)Math.Round(level * 100f);
  }

  public static int SetVolumePercent(int percent) {
    float scalar = Math.Max(0f, Math.Min(1f, percent / 100f));
    Marshal.ThrowExceptionForHR(GetVolumeObject().SetMasterVolumeLevelScalar(scalar, Guid.Empty));
    return GetVolumePercent();
  }
}
"@
'''


def _win_get_volume() -> int:
    script = _win_volume_script() + "\n[WinVolume]::GetVolumePercent()"
    result = _run(["powershell", "-NoProfile", "-Command", script])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "PowerShell failed")
    return _clamp(int(result.stdout.strip()))


def _win_set_volume(value: int) -> int:
    value = _clamp(value)
    script = _win_volume_script() + f"\n[WinVolume]::SetVolumePercent({value})"
    result = _run(["powershell", "-NoProfile", "-Command", script])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "PowerShell failed")
    return _clamp(int(result.stdout.strip()))


def get_volume() -> int:
    system = platform.system()
    if system == "Linux":
        return _linux_get_volume()
    if system == "Darwin":
        return _mac_get_volume()
    if system == "Windows":
        return _win_get_volume()
    raise RuntimeError(f"Unsupported OS: {system}")


def set_volume(value: int) -> int:
    system = platform.system()
    if system == "Linux":
        return _linux_set_volume(value)
    if system == "Darwin":
        return _mac_set_volume(value)
    if system == "Windows":
        return _win_set_volume(value)
    raise RuntimeError(f"Unsupported OS: {system}")


def read_message() -> Dict[str, Any] | None:
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    if len(raw_length) != 4:
        raise RuntimeError("Invalid message length header")
    message_length = struct.unpack("=I", raw_length)[0]
    message = sys.stdin.buffer.read(message_length)
    if len(message) != message_length:
        raise RuntimeError("Invalid message payload")
    return json.loads(message.decode("utf-8"))


def write_message(message: Dict[str, Any]):
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def handle_command(command: Dict[str, Any]) -> Dict[str, Any]:
    action = command.get("action")
    if action == "get_volume":
        return {"ok": True, "volume": get_volume()}

    if action == "set_volume":
        value = command.get("value")
        if not isinstance(value, int):
            return {"ok": False, "error": "value must be an integer"}
        return {"ok": True, "volume": set_volume(value)}

    if action == "change_volume":
        delta = command.get("delta")
        if not isinstance(delta, int):
            return {"ok": False, "error": "delta must be an integer"}
        new_volume = _clamp(get_volume() + delta)
        return {"ok": True, "volume": set_volume(new_volume)}

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
                response = {"ok": False, "error": str(err)}
            write_message(response)
    except Exception as err:
        write_message({"ok": False, "error": str(err)})


if __name__ == "__main__":
    main()
