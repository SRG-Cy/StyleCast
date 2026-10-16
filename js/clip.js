// CLIP as the tagger uses it: embed the label sentences once, then each photo, and compare.
// Takes the Transformers.js module as an argument, so the browser (from the CDN) and
// scripts/accuracy.mjs (from npm) run the same code.

import { prompts, labelVectors, rank, padToSquare } from "./labels.js";

export const MODEL = "Xenova/clip-vit-base-patch32";

// dtype can be one string or { text, vision }, so the two halves can use different sizes.
export async function createClip(lib, { device = "wasm", dtype = "fp32", progress_callback, cachedVectors } = {}) {
  const d = typeof dtype === "string" ? { text: dtype, vision: dtype } : dtype;
  const opts = { device, progress_callback };
  const processor = await lib.AutoProcessor.from_pretrained(MODEL);
  const vision = await lib.CLIPVisionModelWithProjection.from_pretrained(MODEL, { ...opts, dtype: d.vision });

  let vectors = cachedVectors;
  if (!vectors) {
    const tokenizer = await lib.AutoTokenizer.from_pretrained(MODEL);
    const text = await lib.CLIPTextModelWithProjection.from_pretrained(MODEL, { ...opts, dtype: d.text });
    const embed = async (groups) => {
      const texts = groups.flatMap((g) => g.texts);
      const { text_embeds } = await text(tokenizer(texts, { padding: true, truncation: true }));
      return labelVectors(groups, text_embeds.tolist());
    };
    const p = prompts();
    vectors = { types: await embed(p.types), colours: await embed(p.colours) };
    await text.dispose?.();
  }

  return {
    vectors,
    async classify(image) {
      const rgb = image.rgb();
      const sq = padToSquare(rgb.data, rgb.width, rgb.height, rgb.channels);
      const inputs = await processor(new lib.RawImage(sq.data, sq.width, sq.height, sq.channels));
      const { image_embeds } = await vision(inputs);
      const emb = image_embeds.tolist()[0];
      return { types: rank(emb, vectors.types), colours: rank(emb, vectors.colours) };
    },
  };
}
