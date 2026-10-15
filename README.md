# StyleCast

Photograph your wardrobe once. Every morning, get an outfit from your own clothes that fits the real forecast.

Built for the DEV Hacktoberfest 2026 Open-Source AI Challenge, Week 2 ("Side Hustle").

## What it does

- **Wardrobe scan:** snap each item. An open model running in your browser tags type, colour, warmth, waterproofing and formality. Every tag is editable.
- **Daily outfit:** checks today's forecast (rain, wind, temperature) and your occasion (casual, work or gym), then picks an outfit from your wardrobe.
- **Wear history:** remembers what you wore recently so it doesn't repeat, and lets you mark items "in the wash".
- **Gap spotting:** tells you what your wardrobe is missing for the weather you actually get ("nothing waterproof for days like today").

## Why not just ask ChatGPT?

A chat forgets your wardrobe the moment you close it. StyleCast remembers every item, checks the weather by itself, tracks what you've worn, and has the outfit ready before you ask.

## Runs in your browser

There's nothing to install and no account. Open the link on your phone, photograph your clothes, done.

- The tagging AI runs on your phone or laptop (WebGPU when available, otherwise WebAssembly). The model downloads once (about 150 MB) and the browser keeps it.
- Photos and the wardrobe are stored in your browser (IndexedDB). Nothing is uploaded, and there is no server to pay for.
- The forecast comes from Open-Meteo, called straight from the browser.
- It installs like an app: on Android, tap "Install" (or Chrome's menu > Add to Home screen); on iPhone, Share > Add to Home Screen. It gets its own icon, opens full screen, and works offline after the first visit (using the last saved forecast).

## Open models

| Job | Model | Licence |
|---|---|---|
| Tagging clothes from photos | [CLIP ViT-B/32](https://huggingface.co/Xenova/clip-vit-base-patch32) via [Transformers.js](https://github.com/huggingface/transformers.js) | MIT / Apache 2.0 |
| Weather | Open-Meteo (free, no key) | CC BY 4.0 |

CLIP picks the clothing type and colour from fixed lists. Each type carries the other tags (warmth, waterproof, formality), and every tag is editable. Outfits are picked by rules: weather first, then occasion, then what you haven't worn lately.

## Side hustle model

Free tier with a few outfits a week; about €2–3/month for daily outfits and trip packing lists. Because the AI runs on the user's device, serving one more user costs nothing. Later: shopping-affiliate links for wardrobe gaps.

## Run it

It's a static site, so any web server works:

```bash
python -m http.server 8000
```

Open http://localhost:8000. Add `?mock=1` to skip the model download (every photo gets placeholder tags), which is handy for working on the page.

To publish it, turn on GitHub Pages for the `main` branch (Settings > Pages > Deploy from a branch > `main` / root). GitHub then shows the app's link on that page (`https://<user>.github.io/<repo>/`).

`browser-test.html` is a separate page for measuring tagging speed and accuracy, comparing CLIP with SmolVLM.

## Tests

```bash
npm test
```

Runs the outfit rules with Node's built-in test runner (Node 20+). No packages to install.

## Status

Under construction (Oct 14–18, 2026). See [PLAN.md](PLAN.md).
