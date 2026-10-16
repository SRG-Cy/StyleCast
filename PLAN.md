# StyleCast build plan (Oct 14–18, 2026)

Deadline: Sat Oct 18, 11:59 PM PDT.

## Scope (locked)

In: wardrobe photo upload + auto-tagging, editable tags, daily outfit from forecast + occasion, wear history and "in the wash", wardrobe gap tips, thumbs up/down feedback, install to the home screen, offline use.

Added Oct 15: a budget chat (Shop tab) for the Gemma, Render and SerpApi partner categories, and a new look ("Fitting Room", with the Brolly Hanger logo).

Out: virtual try-on, images of you wearing outfits, accounts/login, multi-item photos (the in-browser tagger reads one item per photo), a native Android or iPhone app (the installable web app covers it).

## Stack (changed Oct 15: everything runs in the browser)

- Static web app, mobile-first, no build step, hosted on GitHub Pages
- Tagging: CLIP zero-shot via Transformers.js (WebGPU, falling back to WebAssembly); the model downloads once (about 300 MB on phones, 16-bit)
- Storage: IndexedDB in the user's browser; photos never leave the device
- Outfit picking: rules in JavaScript (weather, occasion, wear history)
- Budget chat: Gemma 3 (1B on WebGPU, 270M without it) via Transformers.js, on the device
- Shopping links: a tiny Node server on Render holds the SerpApi key and only receives short text searches
- Weather: Open-Meteo, called from the browser; the last forecast is kept for offline use
- Installable web app: manifest, icons and a service worker, so it goes on the home screen, opens full screen and works offline

The first version used a Python server with Ollama (Qwen2.5-VL). It was dropped because users would have had to install Ollama and a 6 GB model.

## Day by day

| Day | Goal | Status |
|---|---|---|
| Tue Oct 14 | Repo, first version (Python server + Ollama) | Done, then replaced |
| Wed Oct 15 | Rebuild in the browser: wardrobe, tagging, outfits, wear history, "in the wash", gap tips. Make it installable and offline. Add the Shop tab (Gemma budget chat, Render shopping server, SerpApi). Rebuild the UI as Fitting Room. | Done (#2 to #7) |
| Thu Oct 16 | Turn on GitHub Pages. Deploy the shopping server on Render with the SerpApi key and try a real search. Test on a real Android phone and iPhone. Measure tagging speed and accuracy on 10+ real photos with `browser-test.html`; switch to SmolVLM if CLIP is too often wrong. | To do |
| Fri Oct 17 | Thumbs up/down on outfits, polish from the phone test, test with 30+ real items. | To do |
| Sat Oct 18 | README, screenshots, 60-second demo video/GIF, DEV post with the side-hustle pricing story and the numbers. Submit. | To do |

## Numbers to collect for the post

Seconds per photo (phone and laptop), tag accuracy on real photos, model download size, and a rough cost comparison with a paid vision API (StyleCast costs nothing per user to run, since the AI runs on the user's device).

## Biggest risks

1. Tag accuracy of a small in-browser model -> measure on Thursday; one-tap edits; SmolVLM as a stronger option.
2. Slow or failing AI on older phones -> WebAssembly fallback; test on a real phone Thursday.
3. Setup effort of photographing many items -> start with 10 items; batch upload from the gallery.
4. Generic picks -> thumbs up/down shapes future choices.
