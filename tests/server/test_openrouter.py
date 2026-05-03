from __future__ import annotations

import json
from typing import List

import httpx
import pytest
import respx

from server.errors import ConfigurationError, TransientError
from server.openrouter import OpenRouterClient


@pytest.fixture
def client() -> OpenRouterClient:
    return OpenRouterClient(api_key="sk-or-test", base_url="https://openrouter.example/api/v1")


@respx.mock
async def test_chat_returns_response_text(client: OpenRouterClient) -> None:
    respx.post("https://openrouter.example/api/v1/chat/completions").mock(
        return_value=httpx.Response(200, json={
            "choices": [{"message": {"content": "hello"}}]
        })
    )
    out = await client.chat(
        model="anthropic/claude-sonnet-4",
        system="be brief",
        user="hi",
    )
    assert out == "hello"


@respx.mock
async def test_chat_retries_on_5xx(client: OpenRouterClient) -> None:
    route = respx.post("https://openrouter.example/api/v1/chat/completions")
    route.side_effect = [
        httpx.Response(503),
        httpx.Response(503),
        httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]}),
    ]
    out = await client.chat(
        model="m", system="s", user="u",
        retry_delays=[0, 0, 0],  # no real sleeps in tests
    )
    assert out == "ok"
    assert route.call_count == 3


@respx.mock
async def test_chat_raises_transient_after_three_failures(client: OpenRouterClient) -> None:
    respx.post("https://openrouter.example/api/v1/chat/completions").mock(
        return_value=httpx.Response(500)
    )
    with pytest.raises(TransientError):
        await client.chat(
            model="m", system="s", user="u",
            retry_delays=[0, 0, 0],
        )


@respx.mock
async def test_chat_raises_configuration_on_401(client: OpenRouterClient) -> None:
    respx.post("https://openrouter.example/api/v1/chat/completions").mock(
        return_value=httpx.Response(401, json={"error": {"message": "bad key"}})
    )
    with pytest.raises(ConfigurationError):
        await client.chat(model="m", system="s", user="u")


@respx.mock
async def test_list_models_returns_full_objects(client: OpenRouterClient) -> None:
    respx.get("https://openrouter.example/api/v1/models").mock(
        return_value=httpx.Response(200, json={
            "data": [
                {
                    "id": "anthropic/claude-sonnet-4",
                    "name": "Claude Sonnet 4",
                    "created": 1735690000,
                    "context_length": 200000,
                    "pricing": {"prompt": "0.000003", "completion": "0.000015"},
                    "supported_parameters": ["tools"],
                },
                {"id": "openai/gpt-5", "name": "GPT-5"},
            ]
        })
    )
    models = await client.list_models()
    assert len(models) == 2
    assert models[0]["id"] == "anthropic/claude-sonnet-4"
    assert models[0]["context_length"] == 200000
    assert models[1]["id"] == "openai/gpt-5"
