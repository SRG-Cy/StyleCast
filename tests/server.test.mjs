import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp, parseQuery, slim } from "../server/app.mjs";

async function serve(env, fetchImpl) {
  const server = http.createServer(createApp({ env, fetchImpl }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const get = (path, headers = {}) => fetch(base + path, { headers }).then(async (res) => ({ res, body: await res.json() }));
  return { get, close: () => server.close() };
}

const serp = {
  shopping_results: [
    { title: "Rain jacket A", price: "€29.99", extracted_price: 29.99, source: "Shop A", product_link: "https://a", thumbnail: "t", rating: 4.5, reviews: 10 },
    { title: "Rain jacket B", price: "€79.00", extracted_price: 79, source: "Shop B", link: "https://b" },
    { title: "No price", source: "Shop C", link: "https://c" },
  ],
};

test("cleans the query and rejects bad input", () => {
  assert.deepEqual(parseQuery(new URLSearchParams("q=rain%20jacket!!&max=40&gl=IE")), { q: "rain jacket", max: 40, gl: "ie" });
  assert.ok(parseQuery(new URLSearchParams("q=x")).error);
  assert.ok(parseQuery(new URLSearchParams("q=coat&gl=zz")).error);
  assert.ok(parseQuery(new URLSearchParams("q=coat&max=-5")).error);
});

test("drops results over the cap or without a price", () => {
  assert.deepEqual(slim(serp, 50).map((r) => r.title), ["Rain jacket A"]);
});

test("searches SerpApi with the key and a price filter, then caches", async () => {
  const calls = [];
  const fakeFetch = async (url) => { calls.push(new URL(url)); return new Response(JSON.stringify(serp)); };
  const app = await serve({ SERPAPI_KEY: "secret", ALLOWED_ORIGINS: "https://srg-cy.github.io" }, fakeFetch);
  try {
    const { res, body } = await app.get("/search?q=rain+jacket&max=50&gl=ie", { Origin: "https://srg-cy.github.io" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://srg-cy.github.io");
    assert.equal(body.currency, "EUR");
    assert.deepEqual(body.results.map((r) => r.link), ["https://a"]);
    assert.equal(calls[0].searchParams.get("engine"), "google_shopping");
    assert.equal(calls[0].searchParams.get("api_key"), "secret");
    assert.equal(calls[0].searchParams.get("tbs"), "mr:1,price:1,ppr_max:50");
    assert.ok(!JSON.stringify(body).includes("secret"));

    const again = await app.get("/search?q=Rain+Jacket&max=50&gl=ie");
    assert.equal(again.body.cached, true);
    assert.equal(calls.length, 1);
  } finally {
    app.close();
  }
});

test("other sites don't get CORS access", async () => {
  const app = await serve({ MOCK: "1", ALLOWED_ORIGINS: "https://srg-cy.github.io" });
  try {
    const { res } = await app.get("/search?q=coat", { Origin: "https://evil.example" });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  } finally {
    app.close();
  }
});

test("without a key it says so instead of failing silently", async () => {
  const app = await serve({});
  try {
    assert.equal((await app.get("/search?q=coat")).res.status, 503);
    assert.equal((await app.get("/health")).body.ok, true);
  } finally {
    app.close();
  }
});

test("caps searches per day to protect the SerpApi quota", async () => {
  const fakeFetch = async () => new Response(JSON.stringify(serp));
  const app = await serve({ SERPAPI_KEY: "k", DAILY_LIMIT: "2" }, fakeFetch);
  try {
    assert.equal((await app.get("/search?q=coat+one")).res.status, 200);
    assert.equal((await app.get("/search?q=coat+two")).res.status, 200);
    assert.equal((await app.get("/search?q=coat+three")).res.status, 429);
  } finally {
    app.close();
  }
});
