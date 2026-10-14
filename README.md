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

## Status

Under construction (Oct 14–18, 2026). See [PLAN.md](PLAN.md).
