"""Minimal OpenRouter HTTP client with auto-retry on transient failures."""
from __future__ import annotations

import asyncio
from typing import List, Optional, Sequence

import httpx

from server.errors import ConfigurationError, TransientError

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_RETRY_DELAYS = (1.0, 2.0, 4.0)  # 3 attempts at 1s, 2s, 4s


class OpenRouterClient:
    def __init__(self, *, api_key: str, base_url: str = DEFAULT_BASE_URL):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://localhost.translate.local",
            "X-Title": "Translate",
        }

    async def list_models(self) -> List[dict]:
        """Return the full list of model metadata from OpenRouter.

        Each entry is the unmodified OpenRouter object: id, name, created,
        context_length, pricing.{prompt,completion}, supported_parameters,
        architecture, etc. The client picks what it needs.
        """
        async with httpx.AsyncClient(timeout=30) as h:
            r = await h.get(f"{self.base_url}/models", headers=self._headers)
            r.raise_for_status()
            return r.json()["data"]

    async def chat(
        self,
        *,
        model: str,
        system: str,
        user: str,
        retry_delays: Sequence[float] = DEFAULT_RETRY_DELAYS,
        on_retry=None,  # callable(attempt:int, total:int)
    ) -> str:
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            # Generous cap so long chapter outputs and reviewer suggestion
            # lists don't get truncated mid-response.
            "max_tokens": 16384,
        }
        total = len(retry_delays)
        last_exc: Optional[Exception] = None
        async with httpx.AsyncClient(timeout=600) as h:
            for attempt, delay in enumerate(retry_delays, start=1):
                if attempt > 1 and on_retry is not None:
                    on_retry(attempt, total)
                try:
                    r = await h.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._headers,
                        json=body,
                    )
                    if r.status_code in (401, 403):
                        raise ConfigurationError(f"OpenRouter rejected the API key ({r.status_code})")
                    if r.status_code == 404:
                        raise ConfigurationError(f"Model not available: {model}")
                    if r.status_code >= 500 or r.status_code == 429:
                        last_exc = TransientError(f"HTTP {r.status_code}")
                        if attempt < total:
                            await asyncio.sleep(delay)
                            continue
                        raise last_exc
                    r.raise_for_status()
                    # Some models return null content on empty completions or
                    # safety-filter rejections; treat that as an empty string
                    # so downstream parsers can produce a clean error.
                    content = r.json()["choices"][0]["message"].get("content")
                    return content if isinstance(content, str) else ""
                except httpx.HTTPError as exc:
                    last_exc = TransientError(str(exc))
                    if attempt < total:
                        await asyncio.sleep(delay)
                        continue
                    raise last_exc
        raise TransientError("retry loop exited without result")  # unreachable
