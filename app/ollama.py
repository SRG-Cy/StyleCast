import base64
import json

import httpx

from . import config


class OllamaError(RuntimeError):
    pass


def chat_json(model: str, prompt: str, schema: dict, image: bytes | None = None, timeout: float = 180) -> dict:
    """Ask an Ollama model for a JSON answer that matches `schema` (Ollama structured outputs)."""
    message: dict = {"role": "user", "content": prompt}
    if image is not None:
        message["images"] = [base64.b64encode(image).decode()]
    payload = {
        "model": model,
        "messages": [message],
        "format": schema,
        "stream": False,
        "options": {"temperature": 0},
    }
    try:
        resp = httpx.post(f"{config.OLLAMA_URL}/api/chat", json=payload, timeout=timeout)
        resp.raise_for_status()
        return json.loads(resp.json()["message"]["content"])
    except (httpx.HTTPError, KeyError, json.JSONDecodeError) as exc:
        raise OllamaError(f"Ollama call to {model} failed: {exc}") from exc
