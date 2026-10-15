// Tag a clothing photo with an open model that runs inside the browser.
//
// CLIP (MIT licence) compares the photo with short text labels and picks the closest
// clothing type and colour. Each type carries the other tags the app needs, so the
// model only has to answer two easy questions. The model downloads once (about 150 MB)
// and the browser caches it. Photos never leave the device.

const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const MODEL = "Xenova/clip-vit-base-patch32";

export const TYPES = {
  "t-shirt":       { category: "top", warmth: 1, waterproof: false, formality: "casual" },
  "shirt":         { category: "top", warmth: 2, waterproof: false, formality: "smart" },
  "blouse":        { category: "top", warmth: 1, waterproof: false, formality: "smart" },
  "jumper":        { category: "top", warmth: 3, waterproof: false, formality: "casual" },
  "hoodie":        { category: "top", warmth: 2, waterproof: false, formality: "casual" },
  "sports top":    { category: "top", warmth: 1, waterproof: false, formality: "sporty" },
  "jeans":         { category: "bottom", warmth: 2, waterproof: false, formality: "casual" },
  "trousers":      { category: "bottom", warmth: 2, waterproof: false, formality: "smart" },
  "shorts":        { category: "bottom", warmth: 1, waterproof: false, formality: "casual" },
  "skirt":         { category: "bottom", warmth: 1, waterproof: false, formality: "smart" },
  "leggings":      { category: "bottom", warmth: 2, waterproof: false, formality: "sporty" },
  "dress":         { category: "dress", warmth: 1, waterproof: false, formality: "smart" },
  "rain jacket":   { category: "outerwear", warmth: 2, waterproof: true, formality: "casual" },
  "puffer jacket": { category: "outerwear", warmth: 3, waterproof: false, formality: "casual" },
  "wool coat":     { category: "outerwear", warmth: 3, waterproof: false, formality: "smart" },
  "blazer":        { category: "outerwear", warmth: 2, waterproof: false, formality: "smart" },
  "denim jacket":  { category: "outerwear", warmth: 2, waterproof: false, formality: "casual" },
  "trainers":      { category: "shoes", warmth: 2, waterproof: false, formality: "casual" },
  "boots":         { category: "shoes", warmth: 3, waterproof: true, formality: "casual" },
  "smart shoes":   { category: "shoes", warmth: 2, waterproof: false, formality: "smart" },
  "sandals":       { category: "shoes", warmth: 1, waterproof: false, formality: "casual" },
  "scarf":         { category: "accessory", warmth: 3, waterproof: false, formality: "casual" },
  "hat":           { category: "accessory", warmth: 2, waterproof: false, formality: "casual" },
  "bag":           { category: "accessory", warmth: 1, waterproof: false, formality: "casual" },
};

export const COLOURS = ["black", "white", "grey", "navy", "blue", "light blue", "green", "olive", "red", "burgundy",
  "pink", "purple", "yellow", "orange", "brown", "beige", "cream", "denim", "patterned", "striped"];

// ?mock=1 skips the model (fixed tags), for working on the page without the download.
const MOCK = new URLSearchParams(location.search).has("mock");

let classifier;
let lib;

async function load(onProgress) {
  if (classifier) return classifier;
  lib ??= await import(TRANSFORMERS);
  lib.env.allowLocalModels = false;
  // Phones get the 8-bit model on WebAssembly: the full-size one on WebGPU used more memory than
  // iPhone Safari allows a tab, and Safari reloaded the page ("A problem repeatedly occurred").
  const phone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const gpu = !phone && !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null));
  const files = {};
  classifier = await lib.pipeline("zero-shot-image-classification", MODEL, {
    device: gpu ? "webgpu" : "wasm",
    dtype: gpu ? "fp32" : "q8",
    progress_callback: (p) => {
      if (p.status !== "progress" || !p.total) return;
      files[p.file] = [p.loaded, p.total];
      const [done, total] = Object.values(files).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
      onProgress?.(`Downloading the tagging model (first time only): ${Math.round(done / 1e6)} of ${Math.round(total / 1e6)} MB`);
    },
  });
  return classifier;
}

export async function tag(blob, onProgress) {
  if (MOCK) return { name: "new item", category: "top", colour: "unknown", warmth: 2, waterproof: false, formality: "casual" };
  const clip = await load(onProgress);
  const image = await lib.RawImage.fromBlob(blob);
  // One after the other: the model session can't run two requests at once.
  const types = await clip(image, Object.keys(TYPES), { hypothesis_template: "a photo of a {}" });
  const colours = await clip(image, COLOURS, { hypothesis_template: "a photo of {} clothing" });
  const type = types[0].label;
  const colour = colours[0].label;
  return { name: `${colour} ${type}`, colour, ...TYPES[type] };
}
