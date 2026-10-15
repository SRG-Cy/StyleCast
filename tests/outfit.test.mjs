import { test } from "node:test";
import assert from "node:assert/strict";
import { needs, pick, gaps, reason } from "../js/outfit.js";

const item = (id, category, extra = {}) => ({
  id, name: id, category, colour: "black", warmth: 2, waterproof: false, formality: "casual",
  inWash: false, lastWorn: null, ...extra,
});
const weather = (extra = {}) => ({
  date: "2026-10-15", tempMin: 8, tempMax: 13, rainChance: 70, windKmh: 30, summary: "rain", ...extra,
});

test("cold rainy day needs a warm, waterproof jacket", () => {
  assert.deepEqual(needs(weather({ tempMin: 4, tempMax: 9 })), { warmth: 3, wet: true, windy: false, jacket: true });
});

test("warm dry day needs no jacket", () => {
  const n = needs(weather({ tempMin: 18, tempMax: 24, rainChance: 10, summary: "clear" }));
  assert.equal(n.jacket, false);
  assert.equal(n.warmth, 1);
});

test("picks top, bottom, waterproof coat and shoes on a wet day", () => {
  const wardrobe = [
    item("tee", "top"), item("jeans", "bottom"),
    item("blazer", "outerwear"), item("raincoat", "outerwear", { waterproof: true }),
    item("trainers", "shoes"),
  ];
  assert.deepEqual(pick(wardrobe, weather(), "casual").map((i) => i.id), ["tee", "jeans", "raincoat", "trainers"]);
});

test("skips clothes in the wash and prefers ones not worn recently", () => {
  const wardrobe = [
    item("washing", "top", { inWash: true }),
    item("worn", "top", { lastWorn: "2026-10-14" }),
    item("fresh", "top", { lastWorn: "2026-10-01" }),
    item("jeans", "bottom"),
  ];
  assert.deepEqual(pick(wardrobe, weather({ rainChance: 0, summary: "clear", tempMin: 18, tempMax: 22 }), "casual").map((i) => i.id),
    ["fresh", "jeans"]);
});

test("matches the occasion first", () => {
  const wardrobe = [item("tee", "top"), item("shirt", "top", { formality: "smart" }), item("jeans", "bottom")];
  assert.equal(pick(wardrobe, weather(), "smart")[0].id, "shirt");
});

test("falls back to a dress when there are no bottoms", () => {
  const wardrobe = [item("tee", "top"), item("dress", "dress")];
  assert.deepEqual(pick(wardrobe, weather({ rainChance: 0, summary: "clear", tempMin: 18, tempMax: 22 }), "casual").map((i) => i.id), ["dress"]);
});

test("spots a missing rain jacket and missing shoes", () => {
  const found = gaps([item("tee", "top"), item("jeans", "bottom")], weather());
  assert.equal(found.length, 2);
  assert.match(found[0], /waterproof/);
  assert.match(found[1], /shoes/);
});

test("empty wardrobe gets a friendly reason", () => {
  assert.match(reason([], weather()), /Add some clothes/);
});

test("reason names the waterproof coat on a wet day", () => {
  const coat = item("green raincoat", "outerwear", { waterproof: true });
  assert.match(reason([coat], weather()), /green raincoat keeps you dry/);
});
