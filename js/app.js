import * as store from "./store.js";
import { tag } from "./tagger.js";
import * as weather from "./weather.js";
import { pick, gaps, reason, describe } from "./outfit.js";
import { sampleItems } from "./samples.js";

const $ = (sel) => document.querySelector(sel);
let items = [];
let lastOutfit = null;
const photoUrls = new Map();

// crypto.randomUUID only exists on https and localhost; this also covers a plain-http address on the home Wi-Fi.
const newId = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function photoUrl(item) {
  if (!photoUrls.has(item.id)) photoUrls.set(item.id, URL.createObjectURL(item.photo));
  return photoUrls.get(item.id);
}

function card(item) {
  const el = document.createElement("div");
  el.className = "card" + (item.inWash ? " washing" : "");
  el.innerHTML = `<img alt=""><div class="info"><div></div><div class="tags"></div></div>`;
  el.querySelector("img").src = photoUrl(item);
  el.querySelector(".info div").textContent = item.name;
  el.querySelector(".tags").textContent =
    `${item.category} · warmth ${item.warmth}${item.waterproof ? " · waterproof" : ""}${item.inWash ? " · in the wash" : ""}`;
  el.addEventListener("click", () => openEditor(item));
  return el;
}

async function loadItems() {
  items = await store.all();
  const box = $("#items");
  box.replaceChildren(...items.map(card));
  if (!items.length) box.innerHTML = '<p class="muted">No clothes yet. Tap "Add clothes" to photograph your first item.</p>';
  $("#samples").textContent = items.some((i) => i.sample) ? "Remove the sample clothes" : "Add sample clothes to try it out";
}

$("#samples").addEventListener("click", async () => {
  const samples = items.filter((i) => i.sample);
  if (samples.length) {
    for (const item of samples) {
      await store.remove(item.id);
      URL.revokeObjectURL(photoUrls.get(item.id));
      photoUrls.delete(item.id);
    }
  } else {
    for (const item of await sampleItems(newId)) await store.put(item);
  }
  loadItems();
});

$("#photo").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  const status = $("#upload-status");
  try {
    for (const [n, file] of files.entries()) {
      status.textContent = `Tagging photo ${n + 1} of ${files.length}…`;
      const photo = await store.shrink(file);
      const tags = await tag(photo, (msg) => (status.textContent = msg));
      await store.put({ id: newId(), added: Date.now(), photo, inWash: false, lastWorn: null, ...tags });
      await loadItems();
    }
    status.textContent = "Done. Tap an item to fix any tags.";
  } catch (err) {
    console.error(err);
    status.textContent = `Something went wrong: ${err.message}`;
    loadItems();
  }
});

function openEditor(item) {
  const form = $("#edit-form");
  $("#edit-photo").src = photoUrl(item);
  for (const key of ["name", "category", "colour", "warmth", "formality"]) form.elements[key].value = item[key];
  form.elements.waterproof.checked = item.waterproof;
  form.elements.inWash.checked = item.inWash;
  const dlg = $("#editor");
  dlg.onclose = async () => {
    try {
      if (dlg.returnValue === "save") {
        await store.put({
          ...item,
          name: form.elements.name.value.trim() || item.name,
          category: form.elements.category.value,
          colour: form.elements.colour.value.trim(),
          warmth: Number(form.elements.warmth.value),
          formality: form.elements.formality.value,
          waterproof: form.elements.waterproof.checked,
          inWash: form.elements.inWash.checked,
        });
      } else if (dlg.returnValue === "delete" && confirm(`Delete "${item.name}"?`)) {
        await store.remove(item.id);
        URL.revokeObjectURL(photoUrls.get(item.id));
        photoUrls.delete(item.id);
      }
    } catch (err) {
      alert(err.message);
    }
    loadItems();
  };
  dlg.showModal();
}

$("#get-outfit").addEventListener("click", async () => {
  const btn = $("#get-outfit");
  btn.disabled = true;
  btn.textContent = "Checking the weather and your wardrobe…";
  try {
    items = await store.all();
    const w = await weather.today(await weather.position());
    const chosen = pick(items, w, $("#occasion").value);
    lastOutfit = { ids: chosen.map((i) => i.id), date: w.date };
    $("#weather").textContent = describe(w) + (w.offline ? ` (offline: last saved forecast, for ${w.date})` : "");
    $("#outfit").replaceChildren(...chosen.map(card));
    $("#reason").textContent = reason(chosen, w);
    $("#gaps").replaceChildren(...gaps(items, w).map((g) => Object.assign(document.createElement("li"), { textContent: g })));
    $("#wear").hidden = !chosen.length;
  } catch (err) {
    console.error(err);
    $("#reason").textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "What should I wear?";
  }
});

$("#wear").addEventListener("click", async () => {
  await store.markWorn(lastOutfit.ids, lastOutfit.date);
  $("#wear").hidden = true;
  $("#reason").textContent += " Logged. I won't suggest these again for a few days.";
  loadItems();
});

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== tab.dataset.tab));
  });
}

// Installable app: offline support plus an "Install" prompt.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Offline mode unavailable", err));

const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
let dismissed = false;
try { dismissed = localStorage.getItem("stylecast-install-dismissed") === "1"; } catch {}
let installEvent = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  if (!dismissed) {
    $("#install-btn").hidden = false;
    $("#install").hidden = false;
  }
});
$("#install-btn").addEventListener("click", async () => {
  $("#install").hidden = true;
  await installEvent?.prompt();
  installEvent = null;
});
$("#install-close").addEventListener("click", () => {
  $("#install").hidden = true;
  try { localStorage.setItem("stylecast-install-dismissed", "1"); } catch {}
});
window.addEventListener("appinstalled", () => ($("#install").hidden = true));
// iPhone and iPad have no install prompt, so explain the Share menu instead.
if (!standalone && !dismissed && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
  $("#install-text").textContent = 'To install: tap Share, then "Add to Home Screen".';
  $("#install").hidden = false;
}

loadItems();
