"""Pick an outfit from the wardrobe for today's weather.

Rules decide what the weather needs (warmth, rain cover) and which items are
eligible. The language model then chooses a combination that looks good and
explains it. If the model is unavailable or answers with something invalid,
the rule-based pick is used so the user always gets an outfit.
"""

from datetime import date, timedelta

from . import config
from .models import Formality, Item, Weather
from .ollama import OllamaError, chat_json

RECENT_DAYS = 3


def needs(weather: Weather) -> dict:
    avg = (weather.temp_min + weather.temp_max) / 2
    warmth = 3 if avg < 10 else 2 if avg < 16 else 1
    wet = weather.rain_chance >= 50 or "rain" in weather.summary or "showers" in weather.summary
    return {
        "warmth": warmth,
        "wet": wet,
        "windy": weather.wind_kmh >= 40,
        "jacket": avg < 16 or wet,
    }


def _recently_worn(item: Item, today: str) -> bool:
    if not item.last_worn:
        return False
    return date.fromisoformat(today) - date.fromisoformat(item.last_worn) < timedelta(days=RECENT_DAYS)


def _rank(items: list[Item], want_warmth: int, occasion: Formality, today: str) -> list[Item]:
    def score(i: Item) -> tuple:
        return (
            i.formality != occasion,
            _recently_worn(i, today),
            abs(i.warmth - want_warmth),
        )

    return sorted(items, key=score)


def rule_pick(items: list[Item], weather: Weather, occasion: Formality) -> list[Item]:
    n = needs(weather)
    by_cat: dict[str, list[Item]] = {}
    for i in items:
        if not i.in_wash:
            by_cat.setdefault(i.category, []).append(i)

    def best(cat: str) -> Item | None:
        ranked = _rank(by_cat.get(cat, []), n["warmth"], occasion, weather.date)
        return ranked[0] if ranked else None

    chosen: list[Item] = []
    top, bottom, dress = best("top"), best("bottom"), best("dress")
    if top and bottom:
        chosen += [top, bottom]
    elif dress:
        chosen.append(dress)
    else:
        chosen += [x for x in (top, bottom) if x]

    def best_for_weather(cat: str) -> Item | None:
        ranked = _rank(by_cat.get(cat, []), n["warmth"], occasion, weather.date)
        if n["wet"]:
            # Stable sort keeps the ranking within waterproof and non-waterproof groups.
            ranked = sorted(ranked, key=lambda i: not i.waterproof)
        return ranked[0] if ranked else None

    if n["jacket"] and (coat := best_for_weather("outerwear")):
        chosen.append(coat)
    if shoes := best_for_weather("shoes"):
        chosen.append(shoes)
    return chosen


def gaps(items: list[Item], weather: Weather) -> list[str]:
    n = needs(weather)
    found = []
    have = [i for i in items if not i.in_wash]
    cats = {i.category for i in have}
    if n["wet"] and not any(i.waterproof and i.category == "outerwear" for i in have):
        found.append("You have nothing waterproof to wear on top for days like today. A rain jacket would cover it.")
    if n["warmth"] == 3 and not any(i.warmth == 3 for i in have):
        found.append("Nothing in your wardrobe is tagged as really warm, and today is cold.")
    if "shoes" not in cats:
        found.append("Add at least one pair of shoes so outfits are complete.")
    if not ({"top", "bottom"} <= cats or "dress" in cats):
        found.append("Add a few tops and bottoms so StyleCast can build full outfits.")
    return found


def _describe(weather: Weather) -> str:
    return (
        f"{weather.summary}, {weather.temp_min:.0f} to {weather.temp_max:.0f}°C, "
        f"{weather.rain_chance}% chance of rain, wind up to {weather.wind_kmh:.0f} km/h"
    )


def _rule_reason(chosen: list[Item], weather: Weather) -> str:
    n = needs(weather)
    bits = [f"Today is {_describe(weather)}."]
    if n["wet"] and any(i.waterproof for i in chosen):
        bits.append("The waterproof piece keeps you dry.")
    elif n["jacket"]:
        bits.append("A layer on top for the cooler air.")
    return " ".join(bits)


PICK_PROMPT = """You are a friendly personal stylist. Choose one outfit for today from the wardrobe below.

Weather: {weather}
What the weather needs: warmth level {warmth} (1 light, 3 warm), {wet}, {jacket}.
Occasion: {occasion}

Rules:
- Use only item ids from the list.
- Either one top and one bottom, or one dress. Add shoes. Add outerwear if a jacket is needed.
- Prefer items not worn in the last {recent} days and that suit the occasion.
- Pick colours that go together.
- reason: one or two short, warm sentences explaining the choice in plain words.

Wardrobe (id | name | category | colour | warmth | waterproof | formality | worn recently):
{items}
"""

PICK_SCHEMA = {
    "type": "object",
    "properties": {
        "item_ids": {"type": "array", "items": {"type": "string"}},
        "reason": {"type": "string"},
    },
    "required": ["item_ids", "reason"],
}


def _valid(chosen: list[Item]) -> bool:
    cats = [i.category for i in chosen]
    has_body = ("top" in cats and "bottom" in cats) or "dress" in cats
    no_dupes = all(cats.count(c) <= 1 for c in ("top", "bottom", "dress", "shoes", "outerwear"))
    return has_body and no_dupes


def pick(items: list[Item], weather: Weather, occasion: Formality) -> tuple[list[Item], str]:
    fallback = rule_pick(items, weather, occasion)
    available = [i for i in items if not i.in_wash]
    if config.MOCK or not available:
        return fallback, _rule_reason(fallback, weather)

    n = needs(weather)
    lines = "\n".join(
        f"{i.id} | {i.name} | {i.category} | {i.colour} | {i.warmth} | {i.waterproof} | {i.formality} | "
        f"{'yes' if _recently_worn(i, weather.date) else 'no'}"
        for i in available
    )
    prompt = PICK_PROMPT.format(
        weather=_describe(weather),
        warmth=n["warmth"],
        wet="rain likely, so prefer waterproof outerwear and shoes" if n["wet"] else "dry",
        jacket="a jacket is needed" if n["jacket"] else "no jacket needed",
        occasion=occasion,
        recent=RECENT_DAYS,
        items=lines,
    )
    try:
        raw = chat_json(config.TEXT_MODEL, prompt, PICK_SCHEMA, timeout=120)
    except OllamaError:
        return fallback, _rule_reason(fallback, weather)

    by_id = {i.id: i for i in available}
    ids = list(dict.fromkeys(raw.get("item_ids", [])))
    chosen = [by_id[x] for x in ids if x in by_id]
    reason = str(raw.get("reason", "")).strip()
    if len(chosen) != len(ids) or not _valid(chosen) or not reason:
        return fallback, _rule_reason(fallback, weather)
    return chosen, reason
