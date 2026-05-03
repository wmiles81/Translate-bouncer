#!/bin/bash
# Translate launcher for macOS.
# Double-click this file in Finder to start Translate.
# On first run, it installs Python dependencies into a local .venv (one-time, ~30s).
# After that, it just starts the app and opens your browser.

set -e

# Move to the folder this script lives in (so paths work no matter where the
# user dragged the unzipped folder).
cd "$(dirname "$0")"

PYTHON_MIN_MAJOR=3
PYTHON_MIN_MINOR=11

# --- find a usable Python -----------------------------------------------------

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

It looks like Python 3.11+ isn't installed on this Mac.

Easiest fix: download the official installer from
   https://www.python.org/downloads/
Run it, then double-click "Launch Translate.command" again.

(If you already have Python through Homebrew, run "brew install python@3.13"
in Terminal and try again.)

EOF
  read -p "Press Return to close this window..." dummy
  exit 1
fi

echo "Using Python: $($PY --version) at $(command -v $PY)"

# --- one-time install --------------------------------------------------------

if [ ! -d ".venv" ]; then
  echo
  echo "First-time setup: creating a local Python environment in .venv ..."
  "$PY" -m venv .venv
  echo "Installing dependencies (this may take ~30 seconds)..."
  ./.venv/bin/pip install --quiet --upgrade pip
  ./.venv/bin/pip install --quiet -e .
  echo "Setup complete."
fi

# --- launch ------------------------------------------------------------------

echo
echo "Starting Translate. Your browser will open in a moment."
echo "To stop Translate, press Ctrl+C here, or just close this Terminal window."
echo

exec ./.venv/bin/translate
