const $ = (sel) => document.querySelector(sel);
let items = [];
let lastOutfit = null;

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

function card(item) {
  const el = document.createElement("div");
  el.className = "card" + (item.in_wash ? " washing" : "");
  el.innerHTML = `
    <img src="/photos/${item.photo}" alt="">
    <div class="info">
      <div></div>
      <div class="tags"></div>
    </div>`;
  el.querySelector(".info div").textContent = item.name;
  el.querySelector(".tags").textContent =
    `${item.category} · warmth ${item.warmth}${item.waterproof ? " · waterproof" : ""}${item.in_wash ? " · in the wash" : ""}`;
  el.addEventListener("click", () => openEditor(item));
  return el;
}

async function loadItems() {
  items = await api("/api/items");
  const box = $("#items");
  box.replaceChildren(...items.map(card));
  if (!items.length) box.innerHTML = '<p class="muted">No clothes yet. Tap "Add clothes" to photograph your first item.</p>';
}

$("#photo").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  for (const [n, file] of files.entries()) {
    $("#upload-status").textContent = `Tagging photo ${n + 1} of ${files.length}…`;
    const form = new FormData();
    form.append("photo", file);
    try {
      await api("/api/items", { method: "POST", body: form });
    } catch (err) {
      $("#upload-status").textContent = err.message;
      e.target.value = "";
      return loadItems();
    }
  }
  $("#upload-status").textContent = "Done. Tap an item to fix any tags.";
  e.target.value = "";
  loadItems();
});

function openEditor(item) {
  const form = $("#edit-form");
  $("#edit-photo").src = `/photos/${item.photo}`;
  for (const key of ["name", "category", "colour", "warmth", "formality"]) form.elements[key].value = item[key];
  form.elements.waterproof.checked = item.waterproof;
  form.elements.in_wash.checked = item.in_wash;
  const dlg = $("#editor");
  dlg.onclose = async () => {
    try {
      if (dlg.returnValue === "save") {
        await api(`/api/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.elements.name.value,
            category: form.elements.category.value,
            colour: form.elements.colour.value,
            warmth: Number(form.elements.warmth.value),
            formality: form.elements.formality.value,
            waterproof: form.elements.waterproof.checked,
            in_wash: form.elements.in_wash.checked,
          }),
        });
      } else if (dlg.returnValue === "delete" && confirm(`Delete "${item.name}"?`)) {
        await api(`/api/items/${item.id}`, { method: "DELETE" });
      }
    } catch (err) {
      alert(err.message);
    }
    loadItems();
  };
  dlg.showModal();
}

function position() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve({}),
      { timeout: 5000 },
    );
  });
}

$("#get-outfit").addEventListener("click", async () => {
  const btn = $("#get-outfit");
  btn.disabled = true;
  btn.textContent = "Checking the weather and your wardrobe…";
  try {
    if (!items.length) await loadItems();
    const where = await position();
    lastOutfit = await api("/api/outfit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ occasion: $("#occasion").value, ...where }),
    });
    const w = lastOutfit.weather;
    $("#weather").textContent =
      `${w.summary}, ${Math.round(w.temp_min)}–${Math.round(w.temp_max)}°C, ${w.rain_chance}% rain, wind ${Math.round(w.wind_kmh)} km/h`;
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    $("#outfit").replaceChildren(...lastOutfit.item_ids.filter((id) => byId[id]).map((id) => card(byId[id])));
    $("#reason").textContent = lastOutfit.item_ids.length ? lastOutfit.reason : "Add some clothes in the Wardrobe tab first.";
    $("#gaps").replaceChildren(...lastOutfit.gaps.map((g) => Object.assign(document.createElement("li"), { textContent: g })));
    $("#wear").hidden = !lastOutfit.item_ids.length;
  } catch (err) {
    $("#reason").textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "What should I wear?";
  }
});

$("#wear").addEventListener("click", async () => {
  await api("/api/wear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_ids: lastOutfit.item_ids }),
  });
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
