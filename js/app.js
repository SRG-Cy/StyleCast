import * as store from "./store.js";
import { tag } from "./tagger.js";
import * as weather from "./weather.js";
import { pick, gaps, reason, describe } from "./outfit.js";

const $ = (sel) => document.querySelector(sel);
let items = [];
let lastOutfit = null;
const photoUrls = new Map();

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
}

$("#photo").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  const status = $("#upload-status");
  try {
    for (const [n, file] of files.entries()) {
      status.textContent = `Tagging photo ${n + 1} of ${files.length}…`;
      const photo = await store.shrink(file);
      const tags = await tag(photo, (msg) => (status.textContent = msg));
      await store.put({ id: crypto.randomUUID(), added: Date.now(), photo, inWash: false, lastWorn: null, ...tags });
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
    $("#weather").textContent = describe(w);
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

loadItems();
