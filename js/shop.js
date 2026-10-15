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

// Gemma's search plan comes back as lines like "rain jacket | 40". Anything else is ignored.
export function parsePlan(text, budget) {
  const plan = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^[\s\-*\d.)]*([\p{L}' -]{2,60}?)\s*\|\s*[€£$₹]?\s*(\d+(?:\.\d+)?)/u);
    if (!m) continue;
    const query = m[1].replace(/\s+/g, " ").trim().toLowerCase();
    if (query.split(" ").length > 6 || plan.some((p) => p.query === query)) continue;
    const max = Number(m[2]);
    plan.push({ query, max: budget ? Math.min(max, budget) : max, why: "" });
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
  return [
    `My wardrobe:\n${wardrobeSummary(items)}`,
    needs.length ? `Gaps the app found:\n${needs.map((n) => `- ${n.query}: ${n.why}`).join("\n")}` : "",
    budget ? `Budget: ${budget} ${currency}` : "",
    who && who !== "any" ? `Shopping for: ${who}` : "",
    `My request: ${message}`,
    "Plan up to 3 Google Shopping searches that would improve my wardrobe most for this request.",
    "Reply ONLY with lines in this form, nothing else:\nsearch words | max price",
  ].filter(Boolean).join("\n\n");
}

export function advicePrompt({ message, items, picks, total, budget, currency }) {
  const sym = SYMBOL[currency] ?? "";
  const lines = picks.map((p) => `- ${p.title}, ${p.price} from ${p.source} (for: ${p.need.query}${p.need.why ? `; ${p.need.why}` : ""})`);
  return [
    `My wardrobe:\n${wardrobeSummary(items)}`,
    `My request: ${message}`,
    `The app found these items${budget ? `, ${sym}${total} in total out of ${sym}${budget}` : ""}:\n${lines.join("\n")}`,
    (items.length
      ? "In 2 to 4 short sentences, tell me why these are good buys and name one or two things I already own that each one goes with. "
      : "My wardrobe is empty, so don't mention anything I own. In 2 to 3 short sentences, tell me why these are good first buys. ") +
      "Only talk about the items listed. Don't invent prices or other products.",
  ].join("\n\n");
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
