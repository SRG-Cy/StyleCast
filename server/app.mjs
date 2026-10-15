// StyleCast's shopping server: turns a few search words into Google Shopping results via SerpApi.
//
// It exists only to keep the SerpApi key off users' phones. It receives short text
// like "rain jacket" and a price cap, never photos or the wardrobe, and stores nothing.
// No packages: Node 20+ has fetch and http built in.

import http from "node:http";

// Countries the app offers. gl is Google's country code; the currency follows from it.
export const COUNTRIES = { ie: "EUR", de: "EUR", fr: "EUR", es: "EUR", it: "EUR", nl: "EUR", uk: "GBP", us: "USD", in: "INR" };

const MAX_RESULTS = 8;
const CACHE_MS = 6 * 3_600_000;

export function config(env = process.env) {
  return {
    key: env.SERPAPI_KEY ?? "",
    mock: env.MOCK === "1",
    origins: (env.ALLOWED_ORIGINS ?? "https://srg-cy.github.io,http://localhost:8000")
      .split(",").map((s) => s.trim()).filter(Boolean),
    // SerpApi's free plan has a monthly search limit, so cap what one day can use.
    dailyLimit: Number(env.DAILY_LIMIT ?? 100),
    perIpLimit: Number(env.PER_IP_LIMIT ?? 20), // searches per IP per 10 minutes
  };
}

// Validate and tidy the query string. Returns { q, max, gl } or { error }.
export function parseQuery(params) {
  const q = (params.get("q") ?? "").replace(/[^\p{L}\p{N}' -]/gu, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2 || q.length > 80) return { error: "q must be 2 to 80 letters" };
  const gl = (params.get("gl") ?? "ie").toLowerCase();
  if (!COUNTRIES[gl]) return { error: `gl must be one of ${Object.keys(COUNTRIES).join(", ")}` };
  const rawMax = params.get("max");
  const max = rawMax == null || rawMax === "" ? null : Number(rawMax);
  if (max != null && !(max > 0 && max < 100_000)) return { error: "max must be a positive number" };
  return { q, max, gl };
}

// Keep only what the app shows, and drop anything over the price cap.
export function slim(serpJson, max) {
  return (serpJson.shopping_results ?? [])
    .map((r) => ({
      title: r.title,
      price: r.price,
      extractedPrice: r.extracted_price,
      source: r.source,
      link: r.product_link ?? r.link,
      thumbnail: r.thumbnail,
      rating: r.rating ?? null,
      reviews: r.reviews ?? null,
    }))
    .filter((r) => r.title && r.link && typeof r.extractedPrice === "number")
    .filter((r) => max == null || r.extractedPrice <= max)
    .slice(0, MAX_RESULTS);
}

export function mockResults(q, max, gl) {
  const sym = { EUR: "€", GBP: "£", USD: "$", INR: "₹" }[COUNTRIES[gl]];
  return [0.4, 0.7, 1.1, 1.6].map((f, n) => {
    const p = Math.round((max ?? 60) * f * 100) / 100;
    return {
      title: `${q} (sample ${n + 1})`, price: `${sym}${p.toFixed(2)}`, extractedPrice: p,
      source: "Sample shop", link: `https://example.com/${encodeURIComponent(q)}/${n + 1}`,
      thumbnail: null, rating: n === 1 ? 4.5 : null, reviews: n === 1 ? 120 : null,
    };
  }).filter((r) => max == null || r.extractedPrice <= max);
}

async function serpSearch({ q, max, gl }, key, fetchImpl) {
  const params = new URLSearchParams({ engine: "google_shopping", q, gl, hl: "en", api_key: key });
  // Google's own price filter, so the results we pay for are mostly under budget.
  if (max != null) params.set("tbs", `mr:1,price:1,ppr_max:${Math.ceil(max)}`);
  const res = await fetchImpl(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) throw new Error(`SerpApi answered ${res.status}`);
  return slim(await res.json(), max);
}

export function createApp({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const cfg = config(env);
  const cache = new Map(); // "gl|max|q" -> { at, results }
  const perIp = new Map(); // ip -> [timestamps]
  let day = "", usedToday = 0;

  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && (cfg.origins.includes("*") || cfg.origins.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
  }

  function send(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  }

  function limited(ip) {
    const t = now();
    const recent = (perIp.get(ip) ?? []).filter((x) => t - x < 600_000);
    if (recent.length >= cfg.perIpLimit) return true;
    recent.push(t);
    perIp.set(ip, recent);
    return false;
  }

  return async function handle(req, res) {
    cors(req, res);
    const url = new URL(req.url, "http://localhost");
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    if (req.method !== "GET") return send(res, 405, { error: "GET only" });
    if (url.pathname === "/health") return send(res, 200, { ok: true, mock: cfg.mock || !cfg.key });
    if (url.pathname !== "/search") return send(res, 404, { error: "not found" });

    const query = parseQuery(url.searchParams);
    if (query.error) return send(res, 400, { error: query.error });
    const currency = COUNTRIES[query.gl];

    if (cfg.mock) return send(res, 200, { currency, mock: true, results: mockResults(query.q, query.max, query.gl) });
    if (!cfg.key) return send(res, 503, { error: "The shopping server has no SerpApi key yet." });

    const cacheKey = `${query.gl}|${query.max}|${query.q.toLowerCase()}`;
    const hit = cache.get(cacheKey);
    if (hit && now() - hit.at < CACHE_MS) return send(res, 200, { currency, cached: true, results: hit.results });

    const ip = (req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress;
    if (limited(ip)) return send(res, 429, { error: "Too many searches. Try again in a few minutes." });
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) [day, usedToday] = [today, 0];
    if (usedToday >= cfg.dailyLimit) return send(res, 429, { error: "Shopping search is resting for today. Try again tomorrow." });
    usedToday++;

    try {
      const results = await serpSearch(query, cfg.key, fetchImpl);
      cache.set(cacheKey, { at: now(), results });
      send(res, 200, { currency, results });
    } catch (err) {
      console.error(err);
      send(res, 502, { error: "Shopping search failed. Try again later." });
    }
  };
}

export function start(port = Number(process.env.PORT ?? 3000)) {
  const server = http.createServer(createApp());
  server.listen(port, () => console.log(`StyleCast shopping server on :${port}`));
  return server;
}
