// The wardrobe lives in IndexedDB on the user's own device. Nothing is uploaded.

const DB_NAME = "stylecast";
const STORE = "items";

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const tx = (await db()).transaction(STORE, mode);
  const req = fn(tx.objectStore(STORE));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Saving failed. Is the phone's storage full?"));
  });
}

export async function all() {
  const items = await run("readonly", (s) => s.getAll());
  return items.sort((a, b) => b.added - a.added);
}

export const put = (item) => run("readwrite", (s) => s.put(item));
export const remove = (id) => run("readwrite", (s) => s.delete(id));

export async function markWorn(ids, date) {
  const items = await all();
  for (const item of items.filter((i) => ids.includes(i.id))) await put({ ...item, lastWorn: date });
}

// Shrink photos before storing them: a phone photo is several MB, and 512 px is plenty for a wardrobe grid.
export async function shrink(file, maxSide = 512) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}
