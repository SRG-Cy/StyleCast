// What the tagger asks CLIP, and how it reads the answer. No model here, so the tests and
// the accuracy script (scripts/accuracy.mjs) use exactly what the app uses.
//
// CLIP scores a photo against sentences. One bare word per type ("a photo of a jeans") left
// it guessing from colour and fabric, so blue jeans came out as a denim jacket. Each type now
// has a few plain descriptions that say what the item looks like, written into several
// sentences, and the type scores the average of those.

export const TYPES = {
  "t-shirt":       { category: "top", warmth: 1, waterproof: false, formality: "casual",
    names: ["a t-shirt", "a short-sleeved t-shirt", "a tee"] },
  "shirt":         { category: "top", warmth: 2, waterproof: false, formality: "smart",
    names: ["a button-up shirt", "a collared shirt", "a dress shirt"] },
  "blouse":        { category: "top", warmth: 1, waterproof: false, formality: "smart",
    names: ["a blouse", "a women's blouse top"] },
  "jumper":        { category: "top", warmth: 3, waterproof: false, formality: "casual",
    names: ["a knitted jumper", "a sweater", "a wool pullover"] },
  "hoodie":        { category: "top", warmth: 2, waterproof: false, formality: "casual",
    names: ["a hoodie", "a hooded sweatshirt", "a sweatshirt"] },
  "sports top":    { category: "top", warmth: 1, waterproof: false, formality: "sporty",
    names: ["a sports top", "a gym vest", "an athletic tank top"] },
  "jeans":         { category: "bottom", warmth: 2, waterproof: false, formality: "casual",
    names: ["a pair of jeans", "blue denim jeans", "denim trousers with two legs"] },
  "trousers":      { category: "bottom", warmth: 2, waterproof: false, formality: "smart",
    names: ["a pair of trousers", "smart trousers", "chinos"] },
  "shorts":        { category: "bottom", warmth: 1, waterproof: false, formality: "casual",
    names: ["a pair of shorts", "short trousers above the knee"] },
  "skirt":         { category: "bottom", warmth: 1, waterproof: false, formality: "smart",
    names: ["a skirt", "a women's skirt"] },
  "leggings":      { category: "bottom", warmth: 2, waterproof: false, formality: "sporty",
    names: ["a pair of leggings", "tight stretchy leggings"] },
  "dress":         { category: "dress", warmth: 1, waterproof: false, formality: "smart",
    names: ["a dress", "a women's dress"] },
  "rain jacket":   { category: "outerwear", warmth: 2, waterproof: true, formality: "casual",
    names: ["a rain jacket", "a waterproof anorak with a hood"] },
  "puffer jacket": { category: "outerwear", warmth: 3, waterproof: false, formality: "casual",
    names: ["a puffer jacket", "a quilted down jacket"] },
  "wool coat":     { category: "outerwear", warmth: 3, waterproof: false, formality: "smart",
    names: ["a long wool coat", "an overcoat"] },
  "blazer":        { category: "outerwear", warmth: 2, waterproof: false, formality: "smart",
    names: ["a blazer", "a suit jacket"] },
  "denim jacket":  { category: "outerwear", warmth: 2, waterproof: false, formality: "casual",
    names: ["a denim jacket with sleeves and a collar", "a jean jacket"] },
  "trainers":      { category: "shoes", warmth: 2, waterproof: false, formality: "casual",
    names: ["a pair of trainers", "sneakers", "running shoes"] },
  "boots":         { category: "shoes", warmth: 3, waterproof: true, formality: "casual",
    names: ["a pair of boots", "ankle boots"] },
  "smart shoes":   { category: "shoes", warmth: 2, waterproof: false, formality: "smart",
    names: ["a pair of leather shoes", "formal shoes", "heels"] },
  "sandals":       { category: "shoes", warmth: 1, waterproof: false, formality: "casual",
    names: ["a pair of sandals", "flip flops"] },
  "scarf":         { category: "accessory", warmth: 3, waterproof: false, formality: "casual",
    names: ["a scarf", "a knitted scarf"] },
  "hat":           { category: "accessory", warmth: 2, waterproof: false, formality: "casual",
    names: ["a hat", "a cap", "a beanie"] },
  "bag":           { category: "accessory", warmth: 1, waterproof: false, formality: "casual",
    names: ["a bag", "a handbag", "a backpack"] },
};

export const COLOURS = ["black", "white", "grey", "navy", "blue", "light blue", "green", "olive", "red", "burgundy",
  "pink", "purple", "yellow", "orange", "brown", "beige", "cream", "denim", "patterned", "striped"];

const TYPE_TEMPLATES = ["a photo of {}.", "a product photo of {}.", "a photo of {} laid flat.", "a photo of {} on a hanger."];
const COLOUR_TEMPLATES = ["a photo of {} clothing.", "a photo of a {} piece of clothing.", "{} clothes."];

const fill = (templates, name) => templates.map((t) => t.replace("{}", name));

// Every sentence to embed, grouped by the label it speaks for.
export function prompts() {
  return {
    types: Object.entries(TYPES).map(([label, t]) => ({ label, texts: t.names.flatMap((n) => fill(TYPE_TEMPLATES, n)) })),
    colours: COLOURS.map((label) => ({ label, texts: fill(COLOUR_TEMPLATES, label) })),
  };
}

const norm = (v) => {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return v.map((x) => x / s);
};

// One unit vector per label: the mean of its sentences' embeddings.
// `embeds` is a flat array of rows, in the same order as the texts of `groups`.
export function labelVectors(groups, embeds) {
  let i = 0;
  return groups.map(({ label, texts }) => {
    const rows = texts.map(() => norm(embeds[i++]));
    const mean = rows[0].map((_, d) => rows.reduce((s, r) => s + r[d], 0) / rows.length);
    return { label, vec: norm(mean) };
  });
}

// Labels ranked by cosine similarity to the image, best first.
export function rank(imageEmbed, vectors) {
  const img = norm(imageEmbed);
  return vectors
    .map(({ label, vec }) => ({ label, score: vec.reduce((s, x, d) => s + x * img[d], 0) }))
    .sort((a, b) => b.score - a.score);
}

export function tagsFor(type, colour) {
  const { names, ...tags } = TYPES[type];
  return { name: `${colour} ${type}`, colour, ...tags };
}

// CLIP crops the photo to its middle square, so a tall photo of jeans loses the waistband and
// the hems and looks like any denim. Pad it to a square on white instead, so CLIP sees all of it.
// Works on raw RGB(A) pixels so it runs the same in the browser and in Node.
export function padToSquare(data, width, height, channels) {
  const side = Math.max(width, height);
  if (width === height) return { data, width, height, channels };
  const out = new Uint8ClampedArray(side * side * channels).fill(255);
  const x0 = Math.floor((side - width) / 2);
  const y0 = Math.floor((side - height) / 2);
  for (let y = 0; y < height; y++) {
    out.set(data.subarray(y * width * channels, (y + 1) * width * channels), ((y + y0) * side + x0) * channels);
  }
  return { data: out, width: side, height: side, channels };
}
