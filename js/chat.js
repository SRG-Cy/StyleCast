// The Shop tab: a chat where you say your budget and get real items that fill your wardrobe's gaps.
//
// 1. Gemma, on this device, reads the wardrobe and plans a few searches ("rain jacket | 35").
// 2. Only those search words go to the StyleCast shopping server on Render, which asks SerpApi.
// 3. The rules in shop.js keep the picks within budget; Gemma explains them.

import * as store from "./store.js";
import * as weather from "./weather.js";
import * as gemma from "./gemma.js";
import {
  parseBudget, wantsShopping, shoppingNeeds, forWho, parsePlan, choose,
  SYSTEM, planPrompt, advicePrompt, chatPrompt, fallbackAdvice, cleanAdvice, adviceFits, SYMBOL,
} from "./shop.js";

const params = new URLSearchParams(location.search);
// The Render service's address. ?shop=http://localhost:3000 points at a local server instead.
const SHOP_API = params.get("shop") ?? "https://stylecast-shop.onrender.com";
const MOCK = params.has("mock");

const COUNTRY_CURRENCY = { ie: "EUR", de: "EUR", fr: "EUR", es: "EUR", it: "EUR", nl: "EUR", uk: "GBP", us: "USD", in: "INR" };
const HOME_FOR = { EUR: "ie", GBP: "uk", USD: "us", INR: "in" };

const $ = (sel) => document.querySelector(sel);
const log = $("#chat-log");

function bubble(who, text = "") {
  const el = document.createElement("div");
  el.className = `bubble ${who}`;
  el.textContent = text;
  log.append(el);
  el.scrollIntoView({ block: "end", behavior: "smooth" });
  return el;
}

function productCard(p) {
  const a = document.createElement("a");
  a.className = "product";
  a.href = p.link;
  a.target = "_blank";
  a.rel = "noopener sponsored";
  a.innerHTML = `<img alt="" loading="lazy" referrerpolicy="no-referrer"><div><div class="title"></div><div class="muted small-text"></div></div>`;
  if (p.thumbnail) a.querySelector("img").src = p.thumbnail;
  else a.querySelector("img").remove();
  a.querySelector(".title").textContent = p.title;
  a.querySelector(".small-text").textContent = `${p.price} · ${p.source} · for ${p.need.query}`;
  return a;
}

function saved(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function remember(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

const country = $("#shop-country");
const who = $("#shop-who");
country.value = saved("stylecast-shop-country", "ie");
who.value = saved("stylecast-shop-who", "any");
country.addEventListener("change", () => remember("stylecast-shop-country", country.value));
who.addEventListener("change", () => remember("stylecast-shop-who", who.value));

async function search(q, max, gl) {
  if (MOCK) {
    const sym = SYMBOL[COUNTRY_CURRENCY[gl]];
    return [0.5, 0.8].map((f, n) => {
      const p = Math.round((max ?? 40) * f);
      return { title: `${q} (sample ${n + 1})`, price: `${sym}${p}`, extractedPrice: p, source: "Sample shop",
        link: "https://example.com/", thumbnail: null, rating: 4.2, reviews: 10 };
    });
  }
  const url = new URL("/search", SHOP_API);
  url.search = new URLSearchParams({ q, gl, ...(max ? { max: String(Math.ceil(max)) } : {}) });
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Shopping search failed (${res.status}).`);
  return body.results;
}

async function shop(message, items, status) {
  const budget = parseBudget(message);
  let gl = country.value;
  // "£40" while the country is set to Ireland: search where that money is spent.
  if (budget?.currency && budget.currency !== COUNTRY_CURRENCY[gl]) gl = HOME_FOR[budget.currency];
  const currency = COUNTRY_CURRENCY[gl];
  const amount = budget?.amount ?? null;
  const needs = shoppingNeeds(items, weather.lastSaved()).map((n) => ({ ...n, query: forWho(n.query, who.value) }));

  let plan = [];
  let gemmaError = null;
  try {
    const text = await gemma.ask(SYSTEM, planPrompt({ message, items, needs, budget: amount, currency, who: who.value }),
      { maxTokens: 80, onProgress: (m) => (status.textContent = m) });
    plan = parsePlan(text, amount).map((p) => {
      const query = forWho(p.query, who.value);
      return { ...p, query, why: needs.find((n) => n.query === query)?.why ?? "" };
    });
  } catch (err) {
    console.error(err);
    gemmaError = err.message ?? String(err);
  }
  // Without Gemma's plan, give the top need most of the money and leave room for a second item.
  if (!plan.length) plan = needs.slice(0, 3).map((n, i) => ({ ...n, max: amount && Math.round(amount * (i ? 0.4 : 0.6)) }));
  if (!plan.length) return { text: "Your wardrobe already covers the basics. Tell me what you'd like, for example \"smart shoes under €60\"." };

  status.textContent = "Searching the shops…";
  const slow = setTimeout(() => (status.textContent = "Waking up the shopping server (it naps when nobody's using it)…"), 4000);
  let groups;
  try {
    groups = await Promise.all(plan.map(async (need) => ({ need, results: await search(need.query, need.max, gl) })));
  } finally {
    clearTimeout(slow);
  }
  const { picks, total } = choose(groups, amount);

  let text = fallbackAdvice(picks, total, amount, currency);
  if (picks.length && !gemmaError) {
    try {
      const advice = cleanAdvice(await gemma.ask(SYSTEM, advicePrompt({ message, items, picks }),
        { onProgress: (m) => (status.textContent = m) }));
      // Keep the rules' wording when Gemma wanders off the items being bought.
      if (adviceFits(advice, picks)) {
        text = advice;
        if (amount) text += `\n\nTotal: ${SYMBOL[currency]}${total} of ${SYMBOL[currency]}${amount}.`;
      }
    } catch (err) {
      console.error(err);
    }
  }
  if (gemmaError) text = `(Gemma couldn't load, so these come from StyleCast's own rules. Reason: ${gemmaError})\n\n${text}`;
  return { text, picks };
}

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  bubble("me", message);
  const reply = bubble("bot", gemma.ready() ? "Thinking…" : "Loading Gemma…");
  reply.classList.add("pending");
  const send = $("#chat-send");
  send.disabled = true;
  try {
    const items = await store.all();
    if (wantsShopping(message)) {
      const { text, picks = [] } = await shop(message, items, reply);
      reply.textContent = text;
      if (picks.length) reply.append(...picks.map(productCard));
    } else {
      reply.textContent = cleanAdvice(await gemma.ask(SYSTEM, chatPrompt({ message, items }), { onProgress: (m) => (reply.textContent = m) }));
    }
  } catch (err) {
    console.error(err);
    reply.textContent = navigator.onLine === false
      ? "You're offline. Shopping needs a connection."
      : `Sorry, that didn't work: ${err.message}`;
  } finally {
    reply.classList.remove("pending");
    send.disabled = false;
    reply.scrollIntoView({ block: "end", behavior: "smooth" });
  }
});

for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => {
    $("#chat-input").value = chip.textContent;
    $("#chat-form").requestSubmit();
  });
}
