#!/bin/bash
# Translate launcher for Linux.
#
# Run from a terminal:    ./launch-translate.sh
# Or, if your file manager supports it, set this file executable
# (chmod +x launch-translate.sh) and double-click it — most desktops
# (GNOME Files, Nautilus, Dolphin, Thunar) will offer to "Run in Terminal".
#
# On first run, it installs Python dependencies into a local .venv (~30s).
# After that, it just starts the app and opens your default browser.

set -e

cd "$(dirname "$0")"

PYTHON_MIN_MAJOR=3
PYTHON_MIN_MINOR=11

find_python() {
  for candidate in python3.13 python3.12 python3.11 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
      ver=$("$candidate" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo "0.0")
      major=$(echo "$ver" | cut -d. -f1)
      minor=$(echo "$ver" | cut -d. -f2)
      if [ "$major" -gt $PYTHON_MIN_MAJOR ] || { [ "$major" -eq $PYTHON_MIN_MAJOR ] && [ "$minor" -ge $PYTHON_MIN_MINOR ]; }; then
        echo "$candidate"
        return 0
      fi
    fi
  done
  return 1
}

PY=$(find_python || true)

if [ -z "$PY" ]; then
  cat <<'EOF'

============================================================
  Translate needs Python 3.11 or newer.
============================================================

Install it with your distro's package manager. Examples:

  Debian / Ubuntu:   sudo apt install python3.11 python3.11-venv
  Fedora:            sudo dnf install python3.11
  Arch:              sudo pacman -S python
  openSUSE:          sudo zypper install python311

Then run this script again.

EOF
  read -p "Press Return to close this window..." dummy
  exit 1
fi

echo "Using Python: $($PY --version) at $(command -v $PY)"

# Some distros split out the venv module — check it works before we try.
if ! "$PY" -c "import venv" >/dev/null 2>&1; then
  cat <<EOF

============================================================
  Your Python is missing the 'venv' module.
============================================================

Install it with:
  Debian / Ubuntu:   sudo apt install ${PY}-venv

Then run this script again.

EOF
  read -p "Press Return to close this window..." dummy
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo
  echo "First-time setup: creating a local Python environment in .venv ..."
  "$PY" -m venv .venv
  echo "Installing dependencies (this may take ~30 seconds)..."
  ./.venv/bin/pip install --quiet --upgrade pip
  ./.venv/bin/pip install --quiet -e .
  echo "Setup complete."
fi

echo
echo "Starting Translate. Your browser will open in a moment."
echo "To stop Translate, press Ctrl+C here, or close this terminal window."
echo

exec ./.venv/bin/translate
