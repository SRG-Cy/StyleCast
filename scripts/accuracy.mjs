// Measures how often the tagger gets the clothing type right, on labelled photos.
//
//   npm i --no-save @huggingface/transformers@3.8.1 && node scripts/accuracy.mjs
//
// Photos come from a public labelled set of product photos (fashion-product-images-small on
// Hugging Face), PER_TYPE of each kind. Or point it at your own: PHOTOS=dir, with one folder per
// type named as in js/labels.js (dir/jeans/1.jpg, dir/hoodie/2.jpg, ...).
// It compares the old way (one word per type, the photo cropped to its middle) with the
// current js/clip.js, at the model sizes the app can use, and prints a table.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import * as lib from "@huggingface/transformers";
import { createClip, MODEL } from "../js/clip.js";
import { TYPES } from "../js/labels.js";

const PER_TYPE = Number(process.env.PER_TYPE || 12);
const DATASET = "ashraq/fashion-product-images-small";

// The set's articleType -> the types we'd accept. Jackets could be any of ours, so only the
// category counts for them.
const ARTICLES = {
  Tshirts: ["t-shirt"], Shirts: ["shirt"], Tops: ["blouse", "t-shirt"], Sweaters: ["jumper"],
  Sweatshirts: ["hoodie"], Jeans: ["jeans"], Trousers: ["trousers"], Shorts: ["shorts"],
  Skirts: ["skirt"], Leggings: ["leggings"], Dresses: ["dress"], Jackets: [], Blazers: ["blazer"],
  "Casual Shoes": ["trainers", "smart shoes"], "Sports Shoes": ["trainers"], "Formal Shoes": ["smart shoes"],
  Heels: ["smart shoes"], Sandals: ["sandals"], "Flip Flops": ["sandals"], Scarves: ["scarf"],
  Caps: ["hat"], Handbags: ["bag"], Backpacks: ["bag"],
};
const categoryOf = (article) => (article === "Jackets" ? "outerwear" : TYPES[ARTICLES[article][0]].category);

async function datasetPhotos() {
  const photos = [];
  for (const article of Object.keys(ARTICLES)) {
    const where = encodeURIComponent(`"articleType"='${article}'`);
    const url = `https://datasets-server.huggingface.co/filter?dataset=${DATASET}&config=default&split=train&where=${where}&offset=0&length=${PER_TYPE}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${article}: ${res.status} ${await res.text()}`);
    for (const { row } of (await res.json()).rows) {
      const img = await fetch(row.image.src);
      photos.push({ article, accept: ARTICLES[article], category: categoryOf(article), bytes: await img.arrayBuffer() });
    }
  }
  return photos;
}

async function folderPhotos(dir) {
  const photos = [];
  for (const type of await readdir(dir)) {
    if (!TYPES[type]) continue;
    for (const f of await readdir(join(dir, type))) {
      photos.push({ article: type, accept: [type], category: TYPES[type].category, bytes: await readFile(join(dir, type, f)) });
    }
  }
  return photos;
}

// Before this fix: the zero-shot pipeline, one word per type, the photo cropped to its middle.
async function before(dtype) {
  const clf = await lib.pipeline("zero-shot-image-classification", MODEL, { dtype });
  return { classify: async (image) => ({ types: await clf(image, Object.keys(TYPES), { hypothesis_template: "a photo of a {}" }) }) };
}

const CONFIGS = [
  ["before, 8-bit (phones until now)", () => before("q8")],
  ["before, full size (computers)", () => before("fp32")],
  ["after, 8-bit", () => createClip(lib, { dtype: "q8" })],
  ["after, 8-bit text + 16-bit photo", () => createClip(lib, { dtype: { text: "q8", vision: "fp16" } })],
  ["after, 16-bit", () => createClip(lib, { dtype: "fp16" })],
  ["after, full size", () => createClip(lib, { dtype: "fp32" })],
];

const photos = process.env.PHOTOS ? await folderPhotos(process.env.PHOTOS) : await datasetPhotos();
const images = await Promise.all(photos.map((p) => lib.RawImage.fromBlob(new Blob([p.bytes]))));
console.log(`${photos.length} photos (${images[0].width}x${images[0].height} first), ${new Set(photos.map((p) => p.article)).size} kinds\n`);

const rows = [];
for (const [name, make] of CONFIGS) {
  let model;
  try { model = await make(); } catch (err) { console.log(`${name}: could not load (${err.message})`); continue; }
  let type = 0, typeOf = 0, cat = 0, jeansAsJacket = 0, jeans = 0;
  const misses = {};
  const t0 = performance.now();
  for (const [i, p] of photos.entries()) {
    const label = (await model.classify(images[i])).types[0].label;
    if (p.accept.length) { typeOf++; if (p.accept.includes(label)) type++; }
    if (TYPES[label].category === p.category) cat++;
    else misses[`${p.article} -> ${label}`] = (misses[`${p.article} -> ${label}`] || 0) + 1;
    if (p.article === "Jeans" || p.article === "jeans") { jeans++; if (TYPES[label].category === "outerwear") jeansAsJacket++; }
  }
  const ms = (performance.now() - t0) / photos.length;
  const pct = (a, b) => `${Math.round((100 * a) / b)}%`;
  rows.push({ config: name, type: pct(type, typeOf), category: pct(cat, photos.length), "jeans as jacket": `${jeansAsJacket}/${jeans}`, "ms/photo (CPU)": Math.round(ms) });
  const top = Object.entries(misses).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} (${v})`).join(", ");
  console.log(`${name}: top wrong categories: ${top || "none"}`);
}
console.log();
console.table(rows);
