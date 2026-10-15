// Gemma, Google's open-weight model, running inside the browser for the budget chat.
//
// With WebGPU it uses Gemma 3 1B; without it (older phones), the smaller Gemma 3 270M on
// WebAssembly so replies still arrive in reasonable time. The model downloads only when the
// chat is first used, the browser caches it, and nothing typed here leaves the device
// except the short search words sent to the shopping server.

const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const MODELS = {
  webgpu: { id: "onnx-community/gemma-3-1b-it-ONNX-GQA", dtype: "q4f16" },
  wasm: { id: "onnx-community/gemma-3-270m-it-ONNX", dtype: "q4" },
};

const MOCK = new URLSearchParams(location.search).has("mock");

let generator;
let loading;
let busy = Promise.resolve();

async function load(onProgress) {
  if (generator) return generator;
  loading ??= (async () => {
    const lib = await import(TRANSFORMERS);
    lib.env.allowLocalModels = false;
    const gpu = !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null));
    const device = gpu ? "webgpu" : "wasm";
    const files = {};
    generator = await lib.pipeline("text-generation", MODELS[device].id, {
      device,
      dtype: MODELS[device].dtype,
      progress_callback: (p) => {
        if (p.status !== "progress" || !p.total) return;
        files[p.file] = [p.loaded, p.total];
        const [done, total] = Object.values(files).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
        onProgress?.(`Downloading Gemma (first time only): ${Math.round(done / 1e6)} of ${Math.round(total / 1e6)} MB`);
      },
    });
    return generator;
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
