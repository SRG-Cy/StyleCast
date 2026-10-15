// Gemma, Google's open-weight model, running inside the browser for the budget chat.
//
// With WebGPU it uses Gemma 3 1B; without it (older phones), the smaller Gemma 3 270M on
// WebAssembly so replies still arrive in reasonable time. If one version fails, the next is
// tried, each in a fresh worker (js/gemma-worker.js). The model downloads only when the chat
// is first used, the browser caches it, and nothing typed here leaves the device except the
// short search words sent to the shopping server.

// Newer than the tagger's copy (js/tagger.js): its ONNX Runtime handles Gemma 3's 4-bit files better.
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

// Tried in order until one loads. q4f16 needs the GPU's 16-bit float support ("shader-f16"),
// which some GPUs lack, so plain q4 and then WebAssembly are the backups.
const CANDIDATES = [
  { id: "onnx-community/gemma-3-1b-it-ONNX-GQA", dtype: "q4f16", device: "webgpu", needs: "shader-f16" },
  { id: "onnx-community/gemma-3-1b-it-ONNX", dtype: "q4", device: "webgpu" },
  { id: "onnx-community/gemma-3-270m-it-ONNX", dtype: "q4", device: "wasm" },
  { id: "onnx-community/gemma-3-1b-it-ONNX", dtype: "q4", device: "wasm" },
];

const params = new URLSearchParams(location.search);
const MOCK = params.has("mock");
// For testing the worker on a local copy of the library; only honoured on localhost.
const LIB = (location.hostname === "localhost" && params.get("tjs")) || TRANSFORMERS;

export let loaded = null; // which candidate is running, for the status line and the DEV post numbers

let worker;
let loading;
let busy = Promise.resolve();
let nextId = 0;

// Start a worker on one candidate. Resolves with the worker once the model is ready.
function tryCandidate(c, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./gemma-worker.js", import.meta.url), { type: "module" });
    w.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.(data.text);
      else if (data.type === "ready") { w.onmessage = null; resolve(w); }
      else if (data.type === "error") { w.terminate(); reject(new Error(data.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "the AI worker crashed")); };
    w.postMessage({ type: "load", lib: LIB, candidate: c });
  });
}

async function load(onProgress) {
  if (worker) return worker;
  loading ??= (async () => {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter().catch(() => null) : null;
    const usable = CANDIDATES.filter((c) => c.device === "wasm" || (adapter && (!c.needs || adapter.features.has(c.needs))));
    const errors = [];
    for (const c of usable) {
      try {
        worker = await tryCandidate(c, onProgress);
        loaded = c;
        console.info("Gemma loaded", c);
        return worker;
      } catch (err) {
        console.warn("Gemma option failed", c, err);
        errors.push(`${c.id.split("/")[1]} ${c.dtype} on ${c.device}: ${err.message}`);
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

export const ready = () => !!worker || MOCK;

function generate(w, messages, maxTokens) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      w.removeEventListener("message", onMessage);
      if (data.type === "result") resolve(data.text);
      else reject(new Error(data.message));
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ type: "generate", id, messages, maxTokens });
  });
}

// One prompt in, Gemma's text out. Requests queue, since the model runs one at a time.
export function ask(system, prompt, { maxTokens = 220, onProgress } = {}) {
  if (MOCK) {
    return Promise.resolve(/a | sign/.test(prompt)
      ? "rain jacket | 35\nplain t-shirt | 15"
      : "(mock Gemma) These fill the gaps StyleCast found and go with what you already own.");
  }
  const run = busy.then(async () => {
    const w = await load(onProgress);
    onProgress?.("Gemma is thinking…");
    return generate(w, [{ role: "system", content: system }, { role: "user", content: prompt }], maxTokens);
  });
  busy = run.catch(() => {});
  return run;
}
