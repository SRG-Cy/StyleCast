import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBudget, wantsShopping, shoppingNeeds, forWho, parsePlan, gapsOnly, choose, fallbackAdvice, cleanAdvice, adviceFits } from "../js/shop.js";

const item = (name, category, extra = {}) => ({
  id: name, name, category, colour: "black", warmth: 2, waterproof: false, formality: "casual", ...extra,
});

test("reads budgets written in different ways", () => {
  assert.deepEqual(parseBudget("I have a 50 euro today to buy something"), { amount: 50, currency: "EUR" });
  assert.deepEqual(parseBudget("I've got €35.50"), { amount: 35.5, currency: "EUR" });
  assert.deepEqual(parseBudget("40£ for shoes"), { amount: 40, currency: "GBP" });
  assert.deepEqual(parseBudget("budget is 1,200 rupees"), { amount: 1200, currency: "INR" });
  assert.deepEqual(parseBudget("I can spend 60"), { amount: 60, currency: null });
  assert.equal(parseBudget("what goes with my jeans?"), null);
});

test("tells shopping requests from outfit questions", () => {
  assert.ok(wantsShopping("I have 50 euro, what should I buy?"));
  assert.ok(wantsShopping("suggest something to improve my wardrobe"));
  assert.ok(!wantsShopping("what goes with my jeans?"));
});

test("puts the rain jacket first on a wet day", () => {
  const wardrobe = [item("tee", "top"), item("jeans", "bottom"), item("trainers", "shoes")];
  const wet = { tempMin: 12, tempMax: 15, rainChance: 80, summary: "rain" };
  const needs = shoppingNeeds(wardrobe, wet).map((n) => n.query);
  assert.equal(needs[0], "rain jacket");
  assert.ok(needs.includes("waterproof boots"));
  assert.ok(!needs.includes("white trainers"));
});

test("a full wardrobe has no needs", () => {
  const wardrobe = [
    ...["a", "b", "c", "d"].map((n) => item(n, "top")),
    item("jumper", "top", { warmth: 3 }), item("jeans", "bottom"), item("chinos", "bottom", { formality: "smart" }),
    item("raincoat", "outerwear", { waterproof: true }), item("boots", "shoes", { waterproof: true }),
  ];
  assert.deepEqual(shoppingNeeds(wardrobe), []);
});

test("adds who it's for unless the search already says", () => {
  assert.equal(forWho("rain jacket", "women's"), "women's rain jacket");
  assert.equal(forWho("men's boots", "women's"), "men's boots");
  assert.equal(forWho("rain jacket", "any"), "rain jacket");
});

test("reads Gemma's search plan and ignores chatter", () => {
  const text = "Sure! Here you go:\n1. Rain Jacket | €35\n- plain white t-shirt | 15\nrain jacket | 20\nhat | 99\nscarf | 5";
  assert.deepEqual(parsePlan(text, 50), [
    { query: "rain jacket", max: 35, why: "" },
    { query: "plain white t-shirt", max: 15, why: "" },
    { query: "hat", max: 50, why: "" },
  ]);
  assert.deepEqual(parsePlan("I think you should buy a coat.", 50), []);
  // Seen on a real run: Gemma 3 1B echoed the format line instead of a search.
  assert.deepEqual(parsePlan("search words | 21", 50), []);
});

test("keeps the picks within budget", () => {
  const r = (title, price, rating = null) => ({ title, price: `€${price}`, extractedPrice: price, source: "Shop", link: "x", rating });
  const groups = [
    { need: { query: "rain jacket" }, results: [r("cheap jacket", 20), r("good jacket", 30, 4.6), r("posh jacket", 45, 4.9)] },
    { need: { query: "t-shirt" }, results: [r("tee", 25), r("nice tee", 12, 4.1)] },
    { need: { query: "boots" }, results: [r("boots", 40)] },
  ];
  const { picks, total } = choose(groups, 50);
  assert.deepEqual(picks.map((p) => p.title), ["good jacket", "nice tee"]);
  assert.equal(total, 42);
  assert.ok(total <= 50);
  assert.match(fallbackAdvice(picks, total, 50, "EUR"), /€42 of your €50/);
});

test("strips prices Gemma invents and checks the advice is on topic", () => {
  assert.equal(cleanAdvice("The navy t-shirt (€21) pairs with the grey hoodie (€21). Shorts €1 work."),
    "The navy t-shirt pairs with the grey hoodie. Shorts work.");
  const picks = [{ need: { query: "rain jacket" } }];
  assert.ok(adviceFits("A jacket like this keeps you dry.", picks));
  assert.ok(!adviceFits("The navy t-shirt pairs with the grey hoodie.", picks));
});

test("doesn't ask Gemma to pair with clothes when the wardrobe is empty", async () => {
  const { itemAdvicePrompt } = await import("../js/shop.js");
  const pick = { title: "Jacket", price: "€20", source: "Shop", need: { query: "rain jacket", why: "" } };
  assert.match(itemAdvicePrompt({ items: [], pick }), /don.t own any clothes/);
  assert.match(itemAdvicePrompt({ items: [item("tee", "top")], pick }), /Clothes I already own: tee/);
});

test("searches the gaps Gemma left out with the money left over", async () => {
  const { fillPlan } = await import("../js/shop.js");
  const needs = [{ query: "rain jacket", why: "a" }, { query: "warm wool jumper", why: "b" }, { query: "waterproof boots", why: "c" }];
  // Seen on a real run: Gemma picked only the jumper, so €36 of €50 went unused.
  const plan = fillPlan([{ query: "warm wool jumper", max: 28, why: "b" }], needs, 50);
  assert.deepEqual(plan.map((p) => [p.query, p.max]), [["warm wool jumper", 28], ["rain jacket", 22], ["waterproof boots", 22]]);
});

test("keeps Gemma to the gaps when the request names no clothes", () => {
  const needs = [
    { query: "men rain jacket", why: "Nothing waterproof." },
    { query: "men warm wool jumper", why: "Nothing warm." },
    { query: "men waterproof boots", why: "Shoes let rain in." },
  ];
  assert.ok(gapsOnly("I have 50 euro, what should I buy?", needs));
  assert.ok(!gapsOnly("smart shoes under 60 euro", needs));
  assert.ok(!gapsOnly("I have 50 euro", []));
  // Seen on a real run: Gemma suggested trousers although black trousers were owned.
  const text = "warm jumper | 20\ndark grey trousers | 15\nrain jacket | 25";
  assert.deepEqual(parsePlan(text, 50, needs), [
    { query: "men warm wool jumper", max: 20, why: "Nothing warm." },
    { query: "men rain jacket", max: 25, why: "Nothing waterproof." },
  ]);
});

test("drops a closing question from Gemma's advice", () => {
  assert.equal(cleanAdvice("A rain jacket keeps you dry. Do you want to explore other options?"), "A rain jacket keeps you dry.");
  assert.equal(cleanAdvice("Good picks! Want more? Or something else?"), "Good picks!");
  assert.equal(cleanAdvice("What colour do you like?"), "What colour do you like?");
});
