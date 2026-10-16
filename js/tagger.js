// Tag a clothing photo with an open model that runs inside the browser.
//
// CLIP (MIT licence) compares the photo with descriptions of each clothing type and colour
// (js/labels.js) and picks the closest. Each type carries the other tags the app needs, so the
// model only has to answer two easy questions. The model downloads once and the browser caches
// it. Photos never leave the device.

import { createClip, MODEL } from "./clip.js";
import { tagsFor } from "./labels.js";

const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

// ?mock=1 skips the model (fixed tags), for working on the page without the download.
const MOCK = new URLSearchParams(location.search).has("mock");

// Bump when js/labels.js changes, so devices re-embed the new descriptions.
const VECTORS_VERSION = 1;

let clip;
let lib;

async function load(onProgress) {
  if (clip) return clip;
  lib ??= await import(TRANSFORMERS);
  lib.env.allowLocalModels = false;
  // Phones use WebAssembly: the full-size model on WebGPU used more memory than iPhone Safari
  // allows a tab, and Safari reloaded the page ("A problem repeatedly occurred").
  const phone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const gpu = !phone && !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null));
  // The 8-bit text half is as good as full size, so phones save memory there. The photo half
  // stays at 16-bit: 8-bit photos are where jeans turned into jackets (scripts/accuracy.mjs).
  const dtype = gpu ? "fp32" : { text: "q8", vision: "fp16" };
  const key = `stylecast-clip-${MODEL}-${JSON.stringify(dtype)}-${VECTORS_VERSION}`;
  let cachedVectors;
  try { cachedVectors = JSON.parse(localStorage.getItem(key)); } catch {}
  const files = {};
  clip = await createClip(lib, {
    device: gpu ? "webgpu" : "wasm",
    dtype,
    cachedVectors,
    progress_callback: (p) => {
      if (p.status !== "progress" || !p.total) return;
      files[p.file] = [p.loaded, p.total];
      const [done, total] = Object.values(files).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
      onProgress?.(`Downloading the tagging model (first time only): ${Math.round(done / 1e6)} of ${Math.round(total / 1e6)} MB`);
    },
  });
  if (!cachedVectors) try { localStorage.setItem(key, JSON.stringify(clip.vectors)); } catch {}
  return clip;
}

export async function tag(blob, onProgress) {
  if (MOCK) return { name: "new item", category: "top", colour: "unknown", warmth: 2, waterproof: false, formality: "casual" };
  const model = await load(onProgress);
  const { types, colours } = await model.classify(await lib.RawImage.fromBlob(blob));
  return tagsFor(types[0].label, colours[0].label);
}
