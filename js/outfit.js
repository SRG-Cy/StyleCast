// Pick an outfit from the wardrobe for today's weather.
//
// Pure functions with no browser APIs, so they run in Node tests too.
// An item looks like:
//   { id, name, category, colour, warmth: 1-3, waterproof, formality, inWash, lastWorn: "YYYY-MM-DD" | null }
// Weather looks like:
//   { date: "YYYY-MM-DD", tempMin, tempMax, rainChance, windKmh, summary }

export const RECENT_DAYS = 3;

export function needs(weather) {
  const avg = (weather.tempMin + weather.tempMax) / 2;
  const wet = weather.rainChance >= 50 || /rain|showers|drizzle|thunder/.test(weather.summary);
  return {
    warmth: avg < 10 ? 3 : avg < 16 ? 2 : 1,
    wet,
    windy: weather.windKmh >= 40,
    jacket: avg < 16 || wet,
  };
}

const DAY_MS = 86_400_000;

export function recentlyWorn(item, today) {
  if (!item.lastWorn) return false;
  return (Date.parse(today) - Date.parse(item.lastWorn)) / DAY_MS < RECENT_DAYS;
}

function rank(items, wantWarmth, occasion, today) {
  const key = (i) => [i.formality !== occasion ? 1 : 0, recentlyWorn(i, today) ? 1 : 0, Math.abs(i.warmth - wantWarmth)];
  return [...items].sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let n = 0; n < ka.length; n++) if (ka[n] !== kb[n]) return ka[n] - kb[n];
    return 0;
  });
}

export function pick(items, weather, occasion) {
  const n = needs(weather);
  const byCat = {};
  for (const i of items) if (!i.inWash) (byCat[i.category] ??= []).push(i);

  const best = (cat, preferWaterproof = false) => {
    let ranked = rank(byCat[cat] ?? [], n.warmth, occasion, weather.date);
    // Array sort is stable, so the ranking holds within each group.
    if (preferWaterproof) ranked = ranked.sort((a, b) => Number(b.waterproof) - Number(a.waterproof));
    return ranked[0] ?? null;
  };

  const chosen = [];
  const top = best("top"), bottom = best("bottom"), dress = best("dress");
  if (top && bottom) chosen.push(top, bottom);
  else if (dress) chosen.push(dress);
  else chosen.push(...[top, bottom].filter(Boolean));

  if (n.jacket) {
    const coat = best("outerwear", n.wet);
    if (coat) chosen.push(coat);
  }
  const shoes = best("shoes", n.wet);
  if (shoes) chosen.push(shoes);
  return chosen;
}

export function gaps(items, weather) {
  const n = needs(weather);
  const have = items.filter((i) => !i.inWash);
  const cats = new Set(have.map((i) => i.category));
  const found = [];
  if (n.wet && !have.some((i) => i.waterproof && i.category === "outerwear"))
    found.push("You have nothing waterproof to wear on top for days like today. A rain jacket would cover it.");
  if (n.warmth === 3 && !have.some((i) => i.warmth === 3))
    found.push("Nothing in your wardrobe is tagged as really warm, and today is cold.");
  if (!cats.has("shoes")) found.push("Add at least one pair of shoes so outfits are complete.");
  if (!((cats.has("top") && cats.has("bottom")) || cats.has("dress")))
    found.push("Add a few tops and bottoms so StyleCast can build full outfits.");
  return found;
}

export function describe(weather) {
  return `${weather.summary}, ${Math.round(weather.tempMin)} to ${Math.round(weather.tempMax)}°C, ` +
    `${weather.rainChance}% chance of rain, wind up to ${Math.round(weather.windKmh)} km/h`;
}

export function reason(chosen, weather) {
  if (!chosen.length) return "Add some clothes in the Wardrobe tab first.";
  const n = needs(weather);
  const bits = [];
  const coat = chosen.find((i) => i.category === "outerwear");
  if (n.wet && coat?.waterproof) bits.push(`The ${coat.name} keeps you dry.`);
  else if (n.wet) bits.push("Rain is likely, so take an umbrella too.");
  else if (coat) bits.push(`The ${coat.name} is there for the cooler air.`);
  else if (n.warmth === 1) bits.push("Warm enough to skip the jacket.");
  if (n.windy) bits.push("It's windy, so something that zips or buttons up is a good idea.");
  if (chosen.some((i) => recentlyWorn(i, weather.date)))
    bits.push("Some of this was worn recently because there was nothing else that fits.");
  if (!bits.length) bits.push("These suit today's weather and your occasion.");
  return bits.join(" ");
}
