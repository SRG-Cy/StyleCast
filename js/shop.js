// The budget chat's logic: what to shop for, what fits the budget, and the prompts for Gemma.
//
// Pure functions with no browser APIs, so they run in Node tests too. Gemma (js/gemma.js)
// plans the searches and writes the advice; these rules are the fallback when its answer
// can't be used, and they always do the money maths, so the total never goes over budget.

const SYMBOLS = { "€": "EUR", "£": "GBP", "$": "USD", "₹": "INR" };
const WORDS = { eur: "EUR", euro: "EUR", euros: "EUR", gbp: "GBP", pound: "GBP", pounds: "GBP", quid: "GBP",
  usd: "USD", dollar: "USD", dollars: "USD", bucks: "USD", inr: "INR", rupee: "INR", rupees: "INR", rs: "INR" };
export const SYMBOL = { EUR: "€", GBP: "£", USD: "$", INR: "₹" };

// "I have 50 euro today" -> { amount: 50, currency: "EUR" }. Currency is null when not stated.
export function parseBudget(text) {
  const t = text.toLowerCase().replace(/,(\d{3})/g, "$1");
  let m = t.match(/([€£$₹])\s*(\d+(?:\.\d+)?)/) ?? t.match(/(\d+(?:\.\d+)?)\s*([€£$₹])/);
  if (m) {
    const [sym, num] = /\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    return { amount: Number(num), currency: SYMBOLS[sym] };
  }
  m = t.match(/(\d+(?:\.\d+)?)\s*([a-z]+)/g)?.map((s) => s.match(/(\d+(?:\.\d+)?)\s*([a-z]+)/))
    .find((x) => WORDS[x[2]]);
  if (m) return { amount: Number(m[1]), currency: WORDS[m[2]] };
  m = t.match(/(?:budget|spend|have|got|under|up to|max)\D{0,12}(\d+(?:\.\d+)?)/);
  if (m) return { amount: Number(m[1]), currency: null };
  return null;
}

export function wantsShopping(text) {
  return !!parseBudget(text) || /\b(buy|shop|shopping|spend|purchase|get me|recommend|suggest|improve|missing|need)\b/i.test(text);
}

// One short line per item, for Gemma's prompt. Only names and tags; the photos stay out.
export function wardrobeSummary(items) {
  if (!items.length) return "(empty: nothing added yet)";
  return items.slice(0, 60)
    .map((i) => `- ${i.name} (${i.category}, ${i.formality}, warmth ${i.warmth}${i.waterproof ? ", waterproof" : ""})`)
    .join("\n");
}

// What the wardrobe is missing, most useful first. Each need is a ready-made search.
export function shoppingNeeds(items, weather = null) {
  const count = (cat) => items.filter((i) => i.category === cat).length;
  const has = (fn) => items.some(fn);
  const wet = weather && (weather.rainChance >= 50 || /rain|showers|drizzle|thunder/.test(weather.summary));
  const cold = weather && (weather.tempMin + weather.tempMax) / 2 < 10;
  const list = [];
  if (!has((i) => i.category === "outerwear" && i.waterproof))
    list.push({ query: "rain jacket", why: "You have nothing waterproof to wear on top.", boost: wet });
  if (!has((i) => i.warmth === 3 && (i.category === "top" || i.category === "outerwear")))
    list.push({ query: "warm wool jumper", why: "Nothing you own is tagged as really warm.", boost: cold });
  if (!count("shoes")) list.push({ query: "white trainers", why: "There are no shoes in your wardrobe yet." });
  else if (!has((i) => i.category === "shoes" && i.waterproof))
    list.push({ query: "waterproof boots", why: "None of your shoes keep the rain out.", boost: wet });
  if (count("bottom") < 2 && !count("dress"))
    list.push({ query: "dark jeans", why: "A second pair of bottoms doubles what your tops can make." });
  if (count("top") < 4) list.push({ query: "plain t-shirt", why: "More basic tops mean fewer repeats in the week." });
  if (!has((i) => i.formality === "smart"))
    list.push({ query: "oxford shirt", why: "You have nothing smart for work or a night out." });
  // Weather-relevant needs first; sort is stable, so the order above holds otherwise.
  return list.sort((a, b) => Number(!!b.boost) - Number(!!a.boost)).map(({ boost, ...n }) => n);
}

export function forWho(query, who) {
  return who && who !== "any" && !/\b(men|women|kids)/i.test(query) ? `${who} ${query}` : query;
}

// A search must name a piece of clothing; small models sometimes echo instructions instead.
const CLOTHING = /\b(t-?shirts?|tees?|tops?|shirts?|blouses?|jumpers?|sweaters?|hoodies?|cardigans?|jeans|trousers|chinos|pants|shorts|skirts?|leggings|dress(es)?|jackets?|coats?|parkas?|blazers?|raincoats?|fleeces?|gilets?|trainers|sneakers|boots|shoes|sandals|loafers|scarf|scarves|hats?|beanies?|gloves|bags?|belts?|socks)\b/i;

const FILLER = new Set(["i", "im", "i'm", "want", "need", "some", "a", "an", "the", "new", "buy", "get", "me", "find",
  "for", "looking", "under", "cheap", "pair", "pairs", "of", "any", "show", "my", "to", "with", "and", "or", "can", "you",
  "please", "what", "good", "nice", "few", "two", "one", "suggest", "recommend", "like", "would", "is", "are", "today"]);

// The clothes a request names, with up to two describing words: "smart black shoes under €60"
// -> ["smart black shoes"]. These are searched as asked, without guessing gaps.
export function askedFor(message) {
  const words = message.toLowerCase().replace(/[€£$₹]?\d+(?:[.,]\d+)?\s*(euros?|eur|pounds?|gbp|dollars?|usd|rupees?|inr)?/g, " ")
    .replace(/[^\p{L}' -]/gu, " ").split(/\s+/).filter(Boolean);
  const found = [];
  words.forEach((w, i) => {
    if (!CLOTHING.test(w) || found.length === 3) return;
    const before = [];
    for (let j = i - 1; j >= 0 && before.length < 2 && !FILLER.has(words[j]) && !CLOTHING.test(words[j]); j--) before.unshift(words[j]);
    const q = [...before, w].join(" ");
    if (!found.includes(q)) found.push(q);
  });
  return found;
}

// When the request names no clothing ("I have €50"), Gemma picks from the gaps the app found,
// so a small model can't suggest things already owned. "Smart shoes under €60" lets it choose freely.
export const gapsOnly = (message, needs) => needs.length > 0 && !CLOTHING.test(message);

const core = (q) => q.replace(/^(men|women|kids)\s+/i, "").toLowerCase();
const lastWord = (q) => q.split(" ").at(-1).replace(/s$/, "");

// The need a planned search refers to: "warm jumper" or "rain jacket for men" both count.
function matchNeed(query, needs) {
  return needs.find((n) => query.includes(core(n.query)))
    ?? needs.find((n) => lastWord(core(n.query)) === lastWord(query));
}

// Gemma's search plan comes back as lines like "rain jacket | 40". Anything else is ignored.
// With needs given, only searches for those gaps are kept, under the gap's own name.
export function parsePlan(text, budget, needs = null) {
  const plan = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^[\s\-*\d.)]*([\p{L}' -]{2,60}?)\s*\|\s*[€£$₹]?\s*(\d+(?:\.\d+)?)/u);
    if (!m) continue;
    let query = m[1].replace(/\s+/g, " ").trim().toLowerCase();
    if (!CLOTHING.test(query) || query.split(" ").length > 6) continue;
    let why = "";
    if (needs) {
      const need = matchNeed(query, needs);
      if (!need) continue;
      ({ query, why } = need);
    }
    if (plan.some((p) => p.query === query)) continue;
    const max = Number(m[2]);
    plan.push({ query, max: budget ? Math.min(max, budget) : max, why });
    if (plan.length === 3) break;
  }
  return plan;
}

// Pick at most one product per search, best first, so the total stays within the budget.
// Prefers well-reviewed items, then the cheaper one, to leave room for the next need.
export function choose(groups, budget) {
  let left = budget ?? Infinity;
  const picks = [];
  for (const { need, results } of groups) {
    const fits = results.filter((r) => r.extractedPrice <= left);
    if (!fits.length) continue;
    const good = fits.filter((r) => (r.rating ?? 0) >= 4);
    const best = (good.length ? good : fits).reduce((a, b) => (b.extractedPrice < a.extractedPrice ? b : a));
    picks.push({ ...best, need });
    left -= best.extractedPrice;
    if (picks.length === 3) break;
  }
  const total = Math.round(picks.reduce((s, p) => s + p.extractedPrice, 0) * 100) / 100;
  return { picks, total };
}

export const SYSTEM = "You are StyleCast, a friendly wardrobe assistant inside an outfit app. " +
  "You only help with clothes, outfits and shopping for clothes. Keep answers short and practical.";

export function planPrompt({ message, items, needs, budget, currency, who }) {
  const onlyGaps = gapsOnly(message, needs);
  return [
    `My wardrobe:\n${wardrobeSummary(items)}`,
    needs.length ? `Gaps the app found:\n${needs.map((n) => `- ${n.query}: ${n.why}`).join("\n")}` : "",
    budget ? `Budget: ${budget} ${currency}` : "",
    who && who !== "any" ? `Shopping for: ${who}` : "",
    `My request: ${message}`,
    onlyGaps
      ? "Choose up to 3 of the gaps above that would improve my wardrobe most, most important first. Use the gap names exactly as written."
      : "Plan up to 3 Google Shopping searches for clothes I don't own yet that would improve my wardrobe most for this request.",
    "Reply ONLY with lines like the example: the item to search for, a | sign, and the most to spend on it. No other text.",
    `Example:\n${exampleLines(needs, budget)}`,
  ].filter(Boolean).join("\n\n");
}

function exampleLines(needs, budget) {
  const ex = needs.length ? needs.slice(0, 2).map((n) => n.query) : ["rain jacket", "white trainers"];
  const each = budget ? Math.round(budget / ex.length) : 40;
  return ex.map((q) => `${q} | ${each}`).join("\n");
}

// One short question per item: Gemma 3 1B mixes up "new" and "owned" when asked about several at once.
export function itemAdvicePrompt({ items, pick }) {
  const owned = items.slice(0, 40).map((i) => i.name).join(", ");
  return [
    items.length ? `Clothes I already own: ${owned}.` : "I don't own any clothes in the app yet.",
    `I'm buying a new ${pick.need.query}.${pick.need.why ? ` ${pick.need.why}` : ""}`,
    items.length
      ? `In one sentence, say why a ${pick.need.query} is a good buy and which one or two of the clothes I own it goes with.`
      : `In one sentence, say why a ${pick.need.query} is a good first buy.`,
    "Don't mention prices.",
  ].join("\n\n");
}

// Gemma chooses the most important gaps; any it leaves out are still searched with the money left,
// so a €50 budget isn't spent on one €14 item.
export function fillPlan(plan, needs, budget) {
  const out = [...plan];
  const planned = plan.reduce((s, p) => s + (p.max ?? 0), 0);
  const left = budget ? Math.max(budget - planned, Math.round(budget * 0.4)) : null;
  for (const n of needs) {
    if (out.length === 3) break;
    if (!out.some((p) => p.query === n.query)) out.push({ ...n, max: left });
  }
  return out;
}

// Remove any prices Gemma writes anyway (the app shows the real ones on the product cards), and a
// closing question like "Do you want to explore other options?", since the app can't follow it up.
export function cleanAdvice(text) {
  const t = text.replace(/\s*\(?\s*[€£$₹]\s?\d+(?:[.,]\d+)?\)?/g, "").replace(/[ \t]{2,}/g, " ").replace(/ +([.,!?])/g, "$1").trim();
  const trimmed = t.replace(/(?:\s*[^.!?\n]*\?)+$/, "").trim();
  return trimmed || t;
}

// Use Gemma's advice only if it talks about at least one of the things being bought.
export function adviceFits(text, picks) {
  const t = text.toLowerCase();
  return picks.some((p) => t.includes(p.need.query.split(" ").at(-1).toLowerCase()));
}

export function chatPrompt({ message, items }) {
  return `My wardrobe:\n${wardrobeSummary(items)}\n\nMy question: ${message}\n\nAnswer in 2 to 4 short sentences, using only clothes I own.`;
}

// Used when Gemma isn't loaded or fails: plain advice from the rules.
export function fallbackAdvice(picks, total, budget, currency) {
  if (!picks.length) return "I couldn't find anything that fits that budget. Try a bit more, or ask for one specific item.";
  const sym = SYMBOL[currency] ?? "";
  const bits = picks.map((p) => `${p.need.why || `You asked for ${p.need.query}.`} The ${p.title} is ${p.price}.`);
  return `${bits.join(" ")}${budget ? ` That's ${sym}${total} of your ${sym}${budget}.` : ""}`;
}
