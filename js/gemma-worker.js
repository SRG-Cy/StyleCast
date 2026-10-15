// Runs Gemma off the main thread, so the page stays responsive while it loads and thinks.
//
// js/gemma.js starts one of these per model it tries. If loading fails, that worker is
// thrown away and the next try gets a fresh one: a failed load can leave the AI engine
// in a broken state where every later load fails with the same error.

let generator;

function describe(err) {
  if (typeof err === "number") return `AI engine error ${err} (often out of memory or an unsupported model file)`;
  return err?.message ?? String(err);
}

self.onmessage = async ({ data }) => {
  if (data.type === "load") {
    const { lib: libUrl, candidate: c } = data;
    try {
      const lib = await import(libUrl);
      lib.env.allowLocalModels = false;
      const files = {};
      generator = await lib.pipeline("text-generation", c.id, {
        device: c.device,
        dtype: c.dtype,
        progress_callback: (p) => {
          if (p.status !== "progress" || !p.total) return;
          files[p.file] = [p.loaded, p.total];
          const [done, total] = Object.values(files).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
          self.postMessage({ type: "progress", text: `Downloading Gemma (first time only): ${Math.round(done / 1e6)} of ${Math.round(total / 1e6)} MB` });
        },
      });
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "error", message: describe(err) });
    }
  } else if (data.type === "generate") {
    try {
      const out = await generator(data.messages, { max_new_tokens: data.maxTokens, do_sample: false });
      self.postMessage({ type: "result", id: data.id, text: out[0].generated_text.at(-1).content.trim() });
    } catch (err) {
      self.postMessage({ type: "error", id: data.id, message: describe(err) });
    }
  }
};
