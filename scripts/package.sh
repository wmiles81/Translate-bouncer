#!/bin/bash
# Build a distributable Translate.zip for end users.
#
# What goes inside:
#   server/                    Python source
#   client/dist/               pre-built web UI (no Node.js needed by user)
#   pyproject.toml             so 'pip install -e .' works on the user's box
#   README.md
#   LICENSE.txt
#   QUICK_START.txt
#   Launch Translate.command   (macOS double-click launcher)
#   Launch Translate.bat       (Windows double-click launcher)
#   launch-translate.sh        (Linux launcher)
#
# Run from the repo root:   ./scripts/package.sh
# Output:                   release/Translate.zip

set -e

cd "$(dirname "$0")/.."

ROOT="$(pwd)"
# Stage on LOCAL disk, not the repo volume: the repo often lives on an SMB share,
# where rm -rf/emptyDir race macOS AppleDouble files ("Directory not empty").
STAGE_PARENT="$(mktemp -d "${TMPDIR:-/tmp}/translate-package.XXXXXX")"
STAGE="$STAGE_PARENT/Translate"
ZIP_OUT="$ROOT/release/Translate.zip"
trap 'rm -rf "$STAGE_PARENT"' EXIT

VERSION=$(grep '^version' pyproject.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
echo "Packaging Translate v${VERSION}"

# 1. Build the client (so users don't need Node.js)
echo "Building web UI..."
(cd client && npm install --silent && npm run build --silent)

# 2. Stage the release tree
echo "Staging release tree at $STAGE ..."
for _i in 1 2 3 4 5; do rm -rf "$ROOT/release" 2>/dev/null && break; sleep 0.5; done
mkdir -p "$ROOT/release" "$STAGE"

# Python source (no .pyc, no __pycache__, no test files)
mkdir -p "$STAGE/server"
(cd server && tar --exclude='__pycache__' --exclude='*.pyc' -cf - .) | (cd "$STAGE/server" && tar -xf -)

# Built web UI only — not the source
mkdir -p "$STAGE/client/dist"
(cd client/dist && tar -cf - .) | (cd "$STAGE/client/dist" && tar -xf -)

# Top-level metadata. The repo keeps README revisions side-by-side (README.md
# is the v1 original); the zip ships the CURRENT revision under the plain name.
cp pyproject.toml "$STAGE/"
cp README_v2.md "$STAGE/README.md"
cp LICENSE.txt "$STAGE/"

# Launchers and quick-start
cp release-files/QUICK_START.txt "$STAGE/"
cp "release-files/Launch Translate.command" "$STAGE/"
cp "release-files/Launch Translate.bat" "$STAGE/"
cp "release-files/launch-translate.sh" "$STAGE/"

# Make the unix launchers executable
chmod +x "$STAGE/Launch Translate.command"
chmod +x "$STAGE/launch-translate.sh"

# 3. Create the zip (preserves unix permissions), zipping from the local stage
echo "Creating $ZIP_OUT ..."
(cd "$STAGE_PARENT" && zip -qry "$ZIP_OUT" Translate)

SIZE=$(du -h "$ZIP_OUT" | cut -f1)
echo
echo "  Done. $ZIP_OUT  ($SIZE)"
echo
echo "  To test locally:"
echo "    unzip $ZIP_OUT -d /tmp && open '/tmp/Translate/Launch Translate.command'"
