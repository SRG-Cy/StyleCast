from datetime import date
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config, outfit, vision, weather
from .models import Item, ItemUpdate, Outfit, OutfitRequest, WearRequest
from .ollama import OllamaError
from .store import WardrobeStore

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

app = FastAPI(title="StyleCast")
store = WardrobeStore(config.DATA_DIR)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "mock": config.MOCK, "vision_model": config.VISION_MODEL, "text_model": config.TEXT_MODEL}


@app.get("/api/items")
def list_items() -> list[Item]:
    return store.all()


@app.post("/api/items", status_code=201)
async def add_item(photo: UploadFile = File(...)) -> Item:
    ext = IMAGE_TYPES.get(photo.content_type or "")
    if not ext:
        raise HTTPException(415, "Please upload a JPEG, PNG or WebP photo.")
    data = await photo.read()
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(413, "That photo is over 10 MB. Try a smaller one.")
    try:
        tags = vision.tag_photo(data)
    except OllamaError as exc:
        raise HTTPException(502, f"Couldn't tag the photo. Is Ollama running with {config.VISION_MODEL}? ({exc})")
    return store.add(tags, data, ext)


@app.patch("/api/items/{item_id}")
def update_item(item_id: str, changes: ItemUpdate) -> Item:
    item = store.update(item_id, changes)
    if item is None:
        raise HTTPException(404, "Item not found.")
    return item


@app.delete("/api/items/{item_id}", status_code=204)
def delete_item(item_id: str) -> None:
    if not store.delete(item_id):
        raise HTTPException(404, "Item not found.")


@app.post("/api/outfit")
def todays_outfit(req: OutfitRequest) -> Outfit:
    lat = req.lat if req.lat is not None else config.DEFAULT_LAT
    lon = req.lon if req.lon is not None else config.DEFAULT_LON
    try:
        wx = weather.today(lat, lon)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Couldn't get today's forecast: {exc}")
    items = store.all()
    chosen, reason = outfit.pick(items, wx, req.occasion)
    return Outfit(item_ids=[i.id for i in chosen], reason=reason, weather=wx, gaps=outfit.gaps(items, wx))


@app.post("/api/wear")
def wear(req: WearRequest) -> list[Item]:
    return store.mark_worn(req.item_ids, date.today().isoformat())


app.mount("/photos", StaticFiles(directory=store.photos_dir), name="photos")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
