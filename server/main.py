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

    return app
