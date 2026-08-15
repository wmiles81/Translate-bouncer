#!/usr/bin/env python3
"""serve_help.py — serves a built help/ directory over http://127.0.0.1:<port>.

Why this exists: assets/vanilla is deliberately dependency-free so it can be
opened directly as a file:// URL (see app.js's header comment). That works
great for a plain double-clicked index.html. It does NOT work for editor-
embedded preview surfaces — VS Code's "Simple Browser", Antigravity's
in-editor browser, and similar webviews refuse to load file:// URLs and only
accept http(s):// ones. This script is the bridge: a zero-dependency local
HTTP server that serves an already-built help/ directory (see build_help.py)
so it can be pasted into an editor's browser panel or opened in a normal
browser tab. It changes nothing about how the shell itself works — it is
purely a local file server.

Standard library only — no pip installs — so this script runs unchanged in a
Python project, a JS-only project, or anything else; nothing needs to be
`pip install`ed to serve the help site.

CLI:
    python3 serve_help.py [--dir help] [--port 0] [--no-open] [--print-url]
                           [--verbose] [--build]

    --dir DIR        Directory to serve (default: help). Must already
                      contain index.html and assets/content.js — i.e. the
                      output of build_help.py.
    --port PORT       Port to bind (default: 0 — see note below). Pass a
                      specific port to pin one, e.g. --port 8000.
    --no-open         Don't launch the default browser automatically.
    --print-url       Print the bound URL as a single bare line on stdout
                      (nothing else on that stream), then keep serving. Lets
                      an editor task or calling script capture the URL —
                      e.g. `url=$(python3 serve_help.py --print-url --no-open &
                      wait for the line)` — without scraping a banner message.
                      Per-request logs (--verbose) go to stderr, not stdout,
                      so they never contaminate the captured URL.
    --verbose         Log each HTTP request (default: silent, since a help
                      viewer being refreshed repeatedly is noisy and rarely
                      interesting).
    --build           Run build_help.py first if it exists next to this
                      script and the built content looks stale. Never runs
                      automatically without this flag — rebuilding is a
                      content-generation step and shouldn't be a surprise
                      side effect of "start the server".

Why --port defaults to 0 instead of a fixed port: a fixed default (e.g. 8000)
collides the moment a second project's help server is started while the
first is still running — a common situation when several editor windows are
open at once, each with its own help/ directory. Port 0 asks the OS kernel
for any currently-free ephemeral port, which is always collision-free by
construction. The actual bound port is then printed so the caller knows
where to connect. Pass --port explicitly (e.g. --port 8000) if a stable,
memorable URL is wanted for a single long-running project.

Why this binds to 127.0.0.1 and never 0.0.0.0: this is a local development
convenience tool, not a deployment target. Binding 0.0.0.0 would expose the
project's help content (and, via directory traversal bugs in a lesser
server, potentially more) to anything else on the same network. Loopback-
only binding means only processes on this machine can ever connect.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import socketserver
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

# Explicit MIME overrides. SimpleHTTPRequestHandler's default extensions_map
# already covers .html and .png reasonably, but .js/.css/.md/.json/.svg are
# either missing or platform-dependent (mimetypes' guess depends on the
# host OS's registered MIME database, which is inconsistent enough — some
# Windows/Linux installs don't map .js at all — that relying on it silently
# breaks module scripts or stylesheets on some machines but not others).
# These overrides make behavior identical everywhere.
_MIME_OVERRIDES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}

# Module-level rather than an instance attribute: SimpleHTTPRequestHandler
# (via BaseHTTPRequestHandler) dispatches and handles the request from
# inside __init__, before the caller gets a chance to set any attribute on
# the instance. A per-request-logging toggle therefore has to live somewhere
# the handler class can read at call time without touching __init__ — a
# module-level flag is the simplest thing that works.
_VERBOSE = False


class HelpRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Serves a directory with fixed MIME types, no caching, quiet by default."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        **_MIME_OVERRIDES,
    }

    def end_headers(self):
        # Disabled so an edit -> rebuild (build_help.py) -> refresh loop
        # always shows the new content.js without a hard reload. Help
        # content is small and local; there is no performance cost worth
        # trading correctness for here.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):  # noqa: A002 - matches base signature
        if _VERBOSE:
            super().log_message(format, *args)
        # else: suppressed. (Base implementation writes to stderr, so even
        # when enabled this never touches stdout / --print-url's output.)


class HelpServer(socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def _content_is_stale(help_dir: Path) -> bool:
    """True if any source file is newer than the built content.js.

    Mirrors build_help.py's own staleness notion (manifest.json, credits.md,
    content/**/*.md) without re-implementing its markdown pipeline — this
    only needs mtimes, not a rebuild decision with full validation.
    """
    content_js = help_dir / "assets" / "content.js"
    if not content_js.is_file():
        return True
    built_at = content_js.stat().st_mtime
    sources = [help_dir / "manifest.json", help_dir / "credits.md"]
    content_root = help_dir / "content"
    if content_root.is_dir():
        sources.extend(content_root.rglob("*.md"))
    return any(src.exists() and src.stat().st_mtime > built_at for src in sources)


def _maybe_build(help_dir: Path) -> int:
    """Run build_help.py next to this script if --build was passed.

    Returns 0 to continue, non-zero if the build was attempted and failed.
    Never raises for a *missing* build_help.py — that's not an error, it
    just means --build has nothing to do here.
    """
    build_script = Path(__file__).resolve().parent / "build_help.py"
    if not build_script.is_file():
        print(
            "--build was passed but no build_help.py was found next to "
            "serve_help.py (%s) — skipping rebuild, serving existing content."
            % build_script,
            file=sys.stderr,
        )
        return 0

    if not _content_is_stale(help_dir):
        print("Help content is up to date; skipping rebuild.")
        return 0

    print("Rebuilding help content (source is newer than assets/content.js)...")
    result = subprocess.run([sys.executable, str(build_script), "--help-dir", str(help_dir)])
    return result.returncode


def _check_built(help_dir: Path) -> bool:
    content_js = help_dir / "assets" / "content.js"
    if help_dir.is_dir() and content_js.is_file():
        return True
    print(
        "ERROR: '%s' does not look like a built help site (missing %s).\n"
        "Run 'python3 build_help.py' first to generate it, or pass --build "
        "to this script to do that automatically." % (help_dir, content_js),
        file=sys.stderr,
    )
    return False


def main(argv=None) -> int:
    global _VERBOSE

    parser = argparse.ArgumentParser(
        description="Serve a built help/ directory over http://127.0.0.1:<port> "
        "for editor-embedded browsers (VS Code Simple Browser, Antigravity, "
        "etc.) and headless environments that can't load file:// URLs."
    )
    parser.add_argument("--dir", default="help", help="Directory to serve (default: help)")
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="Port to bind (default: 0 = ask the OS for a free ephemeral port)",
    )
    parser.add_argument(
        "--no-open", action="store_true", help="Don't launch the default browser"
    )
    parser.add_argument(
        "--print-url",
        action="store_true",
        help="Print the bound URL as a single bare line on stdout, then keep serving",
    )
    parser.add_argument(
        "--verbose", action="store_true", help="Log each HTTP request (default: silent)"
    )
    parser.add_argument(
        "--build",
        action="store_true",
        help="Run build_help.py first if present and content looks stale",
    )
    args = parser.parse_args(argv)

    _VERBOSE = args.verbose
    help_dir = Path(args.dir)

    if args.build:
        code = _maybe_build(help_dir)
        if code != 0:
            return code

    if not _check_built(help_dir):
        return 1

    handler = functools.partial(HelpRequestHandler, directory=str(help_dir))

    try:
        httpd = HelpServer(("127.0.0.1", args.port), handler)
    except OSError as e:
        print("ERROR: could not bind 127.0.0.1:%d — %s" % (args.port, e), file=sys.stderr)
        return 1

    actual_port = httpd.server_address[1]
    url = "http://127.0.0.1:%d/" % actual_port

    if args.print_url:
        # Nothing else on stdout in this branch — see --print-url docs above.
        print(url)
    else:
        print("Serving %s at %s (Ctrl+C to stop)" % (help_dir, url))

    if not args.no_open:
        # Fired slightly after serve_forever() starts below via a timer
        # rather than before it, purely so the "Serving..." message (when
        # shown) prints before the browser steals focus.
        threading.Timer(0.3, webbrowser.open, args=(url,)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping help server. Goodbye.")
        return 0
    finally:
        httpd.server_close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
