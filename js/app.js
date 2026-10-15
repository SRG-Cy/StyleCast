import * as store from "./store.js";
import { tag } from "./tagger.js";
import * as weather from "./weather.js";
import { pick, gaps, reason } from "./outfit.js";
import { sampleItems } from "./samples.js";

const $ = (sel) => document.querySelector(sel);
let items = [];
let lastOutfit = null;
let filter = "";
const photoUrls = new Map();

const CATEGORY = { top: "Top", bottom: "Bottom", dress: "Dress", outerwear: "Layer", shoes: "Shoes", accessory: "Extra" };
const WARMTH = { 1: "light", 2: "medium", 3: "warm" };

// crypto.randomUUID only exists on https and localhost; this also covers a plain-http address on the home Wi-Fi.
const newId = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function photoUrl(item) {
  if (!photoUrls.has(item.id)) photoUrls.set(item.id, URL.createObjectURL(item.photo));
  return photoUrls.get(item.id);
}

function card(item) {
  // A real button, so the item editor opens from the keyboard too.
  const el = document.createElement("button");
  el.type = "button";
  el.className = "card" + (item.inWash ? " washing" : "");
  el.innerHTML = `<img alt="" width="256" height="256" loading="lazy"><span class="info"><span class="name"></span><span class="tags"></span></span>`;
  el.querySelector("img").src = photoUrl(item);
  el.querySelector(".name").textContent = item.name;
  el.setAttribute("aria-label", `Edit ${item.name}`);
  el.querySelector(".tags").textContent = [
    CATEGORY[item.category] ?? item.category, WARMTH[item.warmth], item.waterproof && "waterproof", item.inWash && "in the wash",
  ].filter(Boolean).join(" · ");
  el.addEventListener("click", () => openEditor(item));
  return el;
}

async function loadItems() {
  items = await store.all();
  const box = $("#items");
  const shown = filter ? items.filter((i) => i.category === filter) : items;
  box.replaceChildren(...shown.map(card));
  if (!items.length) box.innerHTML = "<p>No clothes yet. Tap “Snap new clothes” to photograph your first item, or add the sample clothes.</p>";
  else if (!shown.length) box.innerHTML = "<p>Nothing in this category yet.</p>";
  const washing = items.filter((i) => i.inWash).length;
  $("#count").textContent = items.length ? `${items.length} item${items.length === 1 ? "" : "s"}${washing ? ` · ${washing} in the wash` : ""}` : "";
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
  await loadItems();
  showOutfit();
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

for (const btn of document.querySelectorAll("#filters .pill-btn")) {
  btn.addEventListener("click", () => {
    filter = btn.dataset.cat;
    document.querySelectorAll("#filters .pill-btn").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    loadItems();
  });
}

// The page background follows the forecast.
function sky(w) {
  const avg = (w.tempMin + w.tempMax) / 2;
  if (/thunder/.test(w.summary)) return "storm";
  if (w.rainChance >= 50 || /rain|showers|drizzle/.test(w.summary)) return "rain";
  if (/snow/.test(w.summary) || avg < 6) return "cold";
  if (/clear/.test(w.summary)) return "sun";
  return "cloud";
}

function gapItem(text) {
  const li = document.createElement("li");
  li.append(Object.assign(document.createElement("span"), { textContent: text }));
  // "Add a few tops…" is fixed in the Wardrobe; anything else is something to buy.
  const wardrobe = /^Add /.test(text);
  const go = Object.assign(document.createElement("button"), {
    type: "button", className: "go-shop", textContent: wardrobe ? "Add clothes" : "Shop it",
  });
  go.addEventListener("click", () => showTab(wardrobe ? "wardrobe" : "shop"));
  li.append(go);
  return li;
}

const occasion = () => document.querySelector('input[name="occasion"]:checked').value;

// Sticker-shaped placeholders while the forecast loads.
function skeleton() {
  return Array.from({ length: 4 }, () => Object.assign(document.createElement("div"), { className: "card skeleton" }));
}

async function showOutfit() {
  const btn = $("#get-outfit");
  btn.disabled = true;
  if (!$("#outfit").children.length && (await store.all()).length) $("#outfit").replaceChildren(...skeleton());
  try {
    items = await store.all();
    const w = await weather.today(await weather.position());
    const chosen = pick(items, w, occasion());
    lastOutfit = { ids: chosen.map((i) => i.id), date: w.date };
    document.body.className = `sky-${sky(w)}`;
    // Match the phone's status bar to the new sky.
    document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue("--sky-top").trim();
    $("#temp").textContent = `${Math.round(w.tempMax)}°`;
    $("#summary").textContent = w.summary;
    $("#weather").textContent = `Low ${Math.round(w.tempMin)}° · ${w.rainChance}% rain · wind ${Math.round(w.windKmh)} km/h` +
      (w.offline ? ` (offline: saved forecast for ${w.date})` : "");
    $("#outfit").replaceChildren(...chosen.map(card));
    $("#outfit").classList.remove("enter");
    void $("#outfit").offsetWidth; // restart the entry animation
    $("#outfit").classList.add("enter");
    $("#reason").textContent = reason(chosen, w);
    // With an empty wardrobe the only useful step is adding clothes, so skip the gap list.
    $("#gaps").replaceChildren(...(items.length ? gaps(items, w).map(gapItem) : []));
    $("#start").hidden = items.length > 0;
    $("#wear").hidden = !chosen.length;
  } catch (err) {
    console.error(err);
    $("#outfit").querySelectorAll(".skeleton").forEach((el) => el.remove());
    $("#reason").textContent = `${err.message} Tap the refresh button to try again.`;
  } finally {
    btn.disabled = false;
  }
}

$("#get-outfit").addEventListener("click", showOutfit);
$("#start").addEventListener("click", () => showTab("wardrobe"));
for (const radio of document.querySelectorAll('input[name="occasion"]')) radio.addEventListener("change", showOutfit);

$("#wear").addEventListener("click", async () => {
  await store.markWorn(lastOutfit.ids, lastOutfit.date);
  $("#wear").hidden = true;
  $("#reason").textContent += " Logged. I won't suggest these again for a few days.";
  loadItems();
});

// The Shop settings button shows the current choice, e.g. "Ireland (€) · Anyone".
function shopWhere() {
  const label = (id) => $(id).selectedOptions[0]?.textContent ?? "";
  $("#shop-where").textContent = `${label("#shop-country")} · ${label("#shop-who")}`;
}
for (const id of ["#shop-country", "#shop-who"]) $(id).addEventListener("change", shopWhere);
// chat.js restores the saved choice when it loads, which may be after this script.
addEventListener("load", shopWhere);

function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
    if (t.dataset.tab === name) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== name));
  scrollTo({ top: 0 });
}
for (const tab of document.querySelectorAll(".tab")) tab.addEventListener("click", () => showTab(tab.dataset.tab));

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

loadItems().then(showOutfit);
