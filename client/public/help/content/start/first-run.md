# Starting Translate the First Time

## Contents

- [Before you start](#before-you-start)
- [Starting it](#starting-it)
- [What the first launch does](#what-the-first-launch-does)
- [Stopping it](#stopping-it)
- [Starting it again later](#starting-it-again-later)

## Before you start

**Python 3.11 or newer.** Translate is a program that runs on your own machine, and Python is the engine it needs.

- **Mac / Windows:** download the installer from [python.org/downloads](https://www.python.org/downloads/). On Windows, tick **"Add Python to PATH"** during install.
- **Linux:** `sudo apt install python3.11 python3.11-venv` (Debian/Ubuntu), `sudo dnf install python3.11` (Fedora), `sudo pacman -S python` (Arch).

**A way to reach an AI** — either an AI subscription you already pay for, or an OpenRouter API key. You can set this up after launching; see <a href="#" data-goto="setup:connect-ai">Connecting an AI</a>.

## Starting it

Unzip `Translate.zip`, then:

- **Mac:** double-click **Launch Translate.command**.
  The first time, macOS may say the file "cannot be opened because it is from an unidentified developer." Right-click the file once, choose **Open**, and confirm. After that, double-clicking works.
- **Windows:** double-click **Launch Translate.bat**.
- **Linux:** open a terminal in the folder and run `./launch-translate.sh`.

## What the first launch does

A Terminal (or Console) window opens and sets itself up — it creates a private Python environment inside the folder and installs what it needs. **This takes about 30 seconds and only happens once.** Then your browser opens to Translate.

> [!WARNING]
> **Keep that Terminal window open while you work.** It *is* the program — the browser tab is just the screen. Closing the window stops Translate mid-round.

If your browser doesn't open by itself, look in the Terminal for a line like `Uvicorn running on http://127.0.0.1:5180` and open that address yourself. The number can differ (5181, 5182…) if something else is using that port.

## Stopping it

Press **Ctrl+C** in the Terminal window, or just close the window. Work already saved stays saved — Translate writes each pass to disk as it finishes, so stopping between rounds never loses a completed round.

## Starting it again later

Double-click the same launcher. The 30-second setup doesn't repeat, and your books are still there. If you double-click while it's already running, it just opens a browser tab pointing at the copy that's already going, rather than starting a second one.

## Related

<a href="#" data-goto="setup:connect-ai">→ Connecting an AI</a>

<a href="#" data-goto="start:add-a-book">→ Adding a Book</a>
