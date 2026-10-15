// Gemma, Google's open-weight model, running inside the browser for the budget chat.
//
// With WebGPU it uses Gemma 3 1B; without it (older phones), the smaller Gemma 3 270M on
// WebAssembly so replies still arrive in reasonable time. If one version fails, the next is
// tried. The model downloads only when the chat is first used, the browser caches it, and
// nothing typed here leaves the device except the short search words sent to the shopping server.

const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
// Tried in order until one loads. q4f16 needs the GPU's 16-bit float support ("shader-f16"),
// which some GPUs lack, so plain q4 and then WebAssembly are the backups.
const CANDIDATES = [
  { id: "onnx-community/gemma-3-1b-it-ONNX-GQA", dtype: "q4f16", device: "webgpu", needs: "shader-f16" },
  { id: "onnx-community/gemma-3-1b-it-ONNX", dtype: "q4", device: "webgpu" },
  { id: "onnx-community/gemma-3-270m-it-ONNX", dtype: "q4", device: "wasm" },
  { id: "onnx-community/gemma-3-1b-it-ONNX", dtype: "q4", device: "wasm" },
];

export let loaded = null; // which candidate is running, for the status line and the DEV post numbers

const MOCK = new URLSearchParams(location.search).has("mock");

let generator;
let loading;
let busy = Promise.resolve();

async function load(onProgress) {
  if (generator) return generator;
  loading ??= (async () => {
    const lib = await import(TRANSFORMERS);
    lib.env.allowLocalModels = false;
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter().catch(() => null) : null;
    const usable = CANDIDATES.filter((c) => c.device === "wasm" || (adapter && (!c.needs || adapter.features.has(c.needs))));
    const errors = [];
    for (const c of usable) {
      const files = {};
      try {
        generator = await lib.pipeline("text-generation", c.id, {
          device: c.device,
          dtype: c.dtype,
          progress_callback: (p) => {
            if (p.status !== "progress" || !p.total) return;
            files[p.file] = [p.loaded, p.total];
            const [done, total] = Object.values(files).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
            onProgress?.(`Downloading Gemma (first time only): ${Math.round(done / 1e6)} of ${Math.round(total / 1e6)} MB`);
          },
        });
        loaded = c;
        console.info("Gemma loaded", c);
        return generator;
      } catch (err) {
        console.warn("Gemma option failed", c, err);
        errors.push(`${c.id.split("/")[1]} ${c.dtype} on ${c.device}: ${err.message ?? err}`);
      }
    }
    throw new Error(errors.join(" | ") || "no option could run in this browser");
  })();
  try {
    return await loading;
  } catch (err) {
    loading = null; // let the next message try again
    throw err;
  }
}

export const ready = () => !!generator || MOCK;

// One prompt in, Gemma's text out. Requests queue, since the model runs one at a time.
export function ask(system, prompt, { maxTokens = 220, onProgress } = {}) {
  if (MOCK) {
    return Promise.resolve(/max price/.test(prompt)
      ? "rain jacket | 35\nplain t-shirt | 15"
      : "(mock Gemma) These fill the gaps StyleCast found and go with what you already own.");
  }
  const run = busy.then(async () => {
    const gen = await load(onProgress);
    onProgress?.("Gemma is thinking…");
    const out = await gen([{ role: "system", content: system }, { role: "user", content: prompt }],
      { max_new_tokens: maxTokens, do_sample: false });
    return out[0].generated_text.at(-1).content.trim();
  });
  busy = run.catch(() => {});
  return run;
}
