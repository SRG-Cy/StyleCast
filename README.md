# StyleCast

Photograph your wardrobe once. Every morning, get an outfit from your own clothes that fits the real forecast.

Built for the DEV Hacktoberfest 2026 Open-Source AI Challenge, Week 2 ("Side Hustle").

## What it does

- **Wardrobe scan:** snap each item (or several laid out on a bed). An open vision model tags type, colour, warmth, waterproofing and formality. Every tag is editable.
- **Daily outfit:** checks today's forecast (rain, wind, temperature) and your occasion (work, gym, night out), then picks an outfit from your wardrobe.
- **Wear history:** remembers what you wore recently so it doesn't repeat, and lets you mark items "in the wash".
- **Gap spotting:** tells you what your wardrobe is missing for the weather you actually get ("nothing waterproof for days like today").

## Why not just ask ChatGPT?

A chat forgets your wardrobe the moment you close it. StyleCast remembers every item, checks the weather by itself, tracks what you've worn, and has the outfit ready before you ask. It runs on open-weight models, so it can be self-hosted cheaply and privately.

## Open models

| Job | Model | Licence |
|---|---|---|
| Tagging clothes from photos | Qwen2.5-VL 7B (via Ollama) | Apache 2.0 |
| Choosing outfits | Llama 3.1 8B or Qwen2.5 7B (via Ollama) | Llama 3.1 Community / Apache 2.0 |
| Weather | Open-Meteo (free, no key) | CC BY 4.0 |

## Side hustle model

Free tier with a few outfits a week; about €2–3/month for daily outfits and trip packing lists. Later: shopping-affiliate links for wardrobe gaps.

## Run it

You need Python 3.11+ and [Ollama](https://ollama.com).

```bash
ollama pull qwen2.5vl:7b   # tags clothes from photos
ollama pull qwen2.5:7b     # picks outfits
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 (or your computer's IP on your phone, same Wi-Fi). Photos and the wardrobe stay in `data/` on your machine.

Settings (environment variables):

| Variable | Default | What it does |
|---|---|---|
| `STYLECAST_VISION_MODEL` | `qwen2.5vl:7b` | Use `qwen2.5vl:3b` on a laptop without a GPU |
| `STYLECAST_TEXT_MODEL` | `qwen2.5:7b` | Any Ollama chat model, e.g. `llama3.1:8b` |
| `STYLECAST_LAT` / `STYLECAST_LON` | Galway | Fallback location if the browser doesn't share one |
| `OLLAMA_URL` | `http://localhost:11434` | Where Ollama runs |
| `STYLECAST_MOCK` | `0` | `1` skips Ollama (fixed tags, rule-based outfits) for UI work |

If the outfit model is down or answers with something invalid, StyleCast falls back to a rule-based pick, so you always get an outfit.

## Tests

```bash
pip install -r requirements.txt
pytest
```

## Status

Under construction (Oct 14–18, 2026). See [PLAN.md](PLAN.md).
