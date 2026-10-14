import pytest
from fastapi.testclient import TestClient

from app import main, outfit
from app.models import Item, Weather

PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)

WET_COLD = Weather(date="2026-10-14", temp_min=6, temp_max=11, rain_chance=80, wind_kmh=35, summary="showers")
WARM_DRY = Weather(date="2026-10-14", temp_min=16, temp_max=22, rain_chance=5, wind_kmh=10, summary="clear")


def make(id, category, warmth=2, waterproof=False, formality="casual", **kw):
    return Item(id=id, photo=f"{id}.png", name=id, category=category, colour="navy",
                warmth=warmth, waterproof=waterproof, formality=formality, **kw)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main.weather, "today", lambda lat, lon: WET_COLD)
    for item in main.store.all():
        main.store.delete(item.id)
    return TestClient(main.app)


def test_upload_tag_edit_delete(client):
    r = client.post("/api/items", files={"photo": ("shirt.png", PNG, "image/png")})
    assert r.status_code == 201
    item = r.json()
    assert item["category"] == "top"
    assert client.get(f"/photos/{item['photo']}").status_code == 200

    r = client.patch(f"/api/items/{item['id']}", json={"name": "navy rain jacket", "category": "outerwear", "waterproof": True})
    assert r.json()["category"] == "outerwear" and r.json()["waterproof"] is True

    assert client.delete(f"/api/items/{item['id']}").status_code == 204
    assert client.get("/api/items").json() == []


def test_rejects_non_images(client):
    r = client.post("/api/items", files={"photo": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 415


def test_invalid_edit_rejected(client):
    item = client.post("/api/items", files={"photo": ("a.png", PNG, "image/png")}).json()
    assert client.patch(f"/api/items/{item['id']}", json={"warmth": 7}).status_code == 422


def test_outfit_endpoint_and_wear_log(client):
    ids = {}
    for name, changes in {
        "jumper": {"category": "top", "warmth": 3},
        "jeans": {"category": "bottom"},
        "raincoat": {"category": "outerwear", "waterproof": True},
        "boots": {"category": "shoes", "waterproof": True},
    }.items():
        item = client.post("/api/items", files={"photo": (f"{name}.png", PNG, "image/png")}).json()
        client.patch(f"/api/items/{item['id']}", json={"name": name, **changes})
        ids[name] = item["id"]

    body = client.post("/api/outfit", json={"occasion": "casual"}).json()
    assert set(body["item_ids"]) == set(ids.values())
    assert body["weather"]["summary"] == "showers"
    assert body["gaps"] == []

    worn = client.post("/api/wear", json={"item_ids": body["item_ids"]}).json()
    assert all(i["last_worn"] for i in worn)


def test_rule_pick_prefers_waterproof_when_wet():
    items = [make("tee", "top", 1), make("jumper", "top", 3), make("jeans", "bottom"),
             make("denim", "outerwear"), make("rain", "outerwear", waterproof=True),
             make("trainers", "shoes"), make("wellies", "shoes", waterproof=True)]
    chosen = {i.id for i in outfit.rule_pick(items, WET_COLD, "casual")}
    assert chosen == {"jumper", "jeans", "rain", "wellies"}


def test_rule_pick_skips_jacket_and_washing_when_warm():
    items = [make("tee", "top", 1), make("linen", "top", 1, in_wash=True), make("shorts", "bottom", 1),
             make("coat", "outerwear", 3), make("sandals", "shoes", 1)]
    chosen = {i.id for i in outfit.rule_pick(items, WARM_DRY, "casual")}
    assert chosen == {"tee", "shorts", "sandals"}


def test_rule_pick_avoids_recently_worn():
    items = [make("blue", "top", last_worn="2026-10-13"), make("green", "top"), make("jeans", "bottom"), make("shoes", "shoes")]
    chosen = {i.id for i in outfit.rule_pick(items, WARM_DRY, "casual")}
    assert "green" in chosen and "blue" not in chosen


def test_gaps_flags_missing_rain_cover():
    items = [make("tee", "top"), make("jeans", "bottom"), make("trainers", "shoes")]
    assert any("waterproof" in g for g in outfit.gaps(items, WET_COLD))


def test_llm_answer_is_validated(monkeypatch):
    items = [make("tee", "top"), make("jeans", "bottom"), make("shoes", "shoes")]
    monkeypatch.setattr(outfit.config, "MOCK", False)
    # Made-up id -> fall back to the rule-based pick.
    monkeypatch.setattr(outfit, "chat_json", lambda *a, **k: {"item_ids": ["tee", "ghost"], "reason": "x"})
    chosen, _ = outfit.pick(items, WARM_DRY, "casual")
    assert {i.id for i in chosen} == {"tee", "jeans", "shoes"}
    # Valid answer -> used as-is.
    monkeypatch.setattr(outfit, "chat_json", lambda *a, **k: {"item_ids": ["tee", "jeans"], "reason": "Easy and light."})
    chosen, reason = outfit.pick(items, WARM_DRY, "casual")
    assert [i.id for i in chosen] == ["tee", "jeans"] and reason == "Easy and light."
