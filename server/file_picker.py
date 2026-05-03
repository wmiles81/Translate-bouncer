"""Native macOS file/folder picker via osascript.

Used by the local web app to let the user pick a path with a native dialog
without giving the browser direct filesystem access. macOS only.
"""
from __future__ import annotations

import subprocess
import sys


class UnsupportedPlatform(Exception):
    pass


_FILE_SCRIPT = """tell application "System Events" to activate
try
\tPOSIX path of (choose file of type {"org.openxmlformats.wordprocessingml.document"} with prompt "Choose a .docx file")
on error
\treturn ""
end try"""

_FOLDER_SCRIPT = """tell application "System Events" to activate
try
\tPOSIX path of (choose folder with prompt "Choose a folder of .docx chapters")
on error
\treturn ""
end try"""


def _run(script: str) -> str | None:
    if sys.platform != "darwin":
        raise UnsupportedPlatform("file picker requires macOS")
    r = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        timeout=300,
    )
    out = (r.stdout or "").strip()
    return out or None


def pick_file() -> str | None:
    """Open a native file picker filtered to .docx. Returns POSIX path or None if cancelled."""
    return _run(_FILE_SCRIPT)


def pick_folder() -> str | None:
    """Open a native folder picker. Returns POSIX path or None if cancelled."""
    return _run(_FOLDER_SCRIPT)
