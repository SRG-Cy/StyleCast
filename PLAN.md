# StyleCast build plan (Oct 14–18, 2026)

Deadline: Sat Oct 18, 11:59 PM PDT.

## Scope (locked)

In: wardrobe photo upload + auto-tagging, editable tags, daily outfit from forecast + occasion, wear history and "in the wash", wardrobe gap tips, thumbs up/down feedback.

Out: virtual try-on, images of you wearing outfits, accounts/login, shopping integration.

## Day by day

| Day | Goal |
|---|---|
| Tue Oct 14 | Repo, stack set up, Ollama running Qwen2.5-VL. Test tagging speed and accuracy on 10 real photos. Decide 7B vs 3B. |
| Wed Oct 15 | Wardrobe: upload, tag to JSON, editable grid, saved locally. Multi-item photo splitting if time allows. |
| Thu Oct 16 | Outfit engine: Open-Meteo forecast + occasion + wardrobe -> outfit with a one-line reason. Wear history, "in the wash", no repeats. |
| Fri Oct 17 | Gap spotting, thumbs up/down, mobile-first polish. Test with 30+ real items. |
| Sat Oct 18 | README, screenshots, 60-second demo video/GIF, DEV post with the side-hustle pricing story. Submit. |

## Stack (changed Oct 15: everything runs in the browser)

- Static web app, mobile-first, no build step; hostable on GitHub Pages
- Tagging: CLIP zero-shot via Transformers.js (WebGPU, falling back to WebAssembly)
- Storage: IndexedDB in the user's browser; photos never leave the device
- Outfit picking: rules in JavaScript (weather, occasion, wear history)
- Weather: Open-Meteo, called from the browser

The first version used a Python server with Ollama (Qwen2.5-VL). It was dropped because users would have had to install Ollama and a 6 GB model.

## Biggest risks

1. Setup effort of photographing many items -> allow multi-item photos, start with 10 items.
2. Tag accuracy of a small in-browser model -> measure with browser-test.html; one-tap edits; SmolVLM as a stronger option.
3. Tag mistakes -> one-tap edits.
4. Generic picks -> thumbs up/down shapes future choices.
