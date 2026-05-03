"""FastAPI app factory + CLI launcher."""
from __future__ import annotations

from fastapi import FastAPI

from server.sse import EventBus

# Process-global event bus shared across requests.
EVENT_BUS = EventBus()


def create_app() -> FastAPI:
    app = FastAPI(title="Translate", version="0.1.0")

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    from server.routes import settings as settings_routes
    app.include_router(settings_routes.router)

    from server.routes import prompts as prompts_routes
    app.include_router(prompts_routes.router)

    from server.routes import books as books_routes
    app.include_router(books_routes.router)

    from server.routes import chapters as chapters_routes
    app.include_router(chapters_routes.router)

    from server.routes import events as events_routes
    app.include_router(events_routes.router)

    from server.routes import system as system_routes
    app.include_router(system_routes.router)

    import os
    from pathlib import Path

    from fastapi.staticfiles import StaticFiles

    dist_env = os.environ.get("TRANSLATE_CLIENT_DIST")
    dist_path = Path(dist_env) if dist_env else Path(__file__).parent.parent / "client" / "dist"
    if dist_path.exists() and (dist_path / "index.html").exists():
        # Mount AFTER all API routes so they take precedence.
        app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="client")

    return app


import socket
import webbrowser

import click

from server.lock import LockHeld, acquire_lock, read_lock, release_lock


def _free_port(start: int = 5180) -> int:
    for port in range(start, start + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("no free port in range")


@click.command(name="translate")
@click.option("--port", type=int, default=None, help="Bind port (default: first free 5180+)")
@click.option("--no-browser", is_flag=True, help="Do not open the browser on launch")
@click.option(
    "--no-browser-on-existing",
    is_flag=True,
    help="When another instance is running, do not open browser; print message and exit",
)
def cli(port: int | None, no_browser: bool, no_browser_on_existing: bool) -> None:
    """Launch the translate local web app."""
    # Pre-check the lock: if held, hand off without starting a server.
    existing = read_lock()
    if existing is not None:
        from server.lock import _pid_alive  # type: ignore
        if _pid_alive(existing["pid"]):
            url = existing["url"]
            click.echo(f"Translate is already running at {url}")
            if not no_browser_on_existing:
                webbrowser.open(url)
            return

    chosen_port = port if port is not None else _free_port()
    url = f"http://localhost:{chosen_port}"
    try:
        acquire_lock(url=url)
    except LockHeld as exc:
        click.echo(f"Translate is already running at {exc.url}")
        if not no_browser_on_existing:
            webbrowser.open(exc.url)
        return

    if not no_browser:
        webbrowser.open(url)

    import uvicorn
    try:
        uvicorn.run(create_app(), host="127.0.0.1", port=chosen_port, log_level="info")
    finally:
        release_lock()
