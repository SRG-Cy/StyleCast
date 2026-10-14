import json
import threading
import uuid
from pathlib import Path

from .models import Item, ItemUpdate, Tags


class WardrobeStore:
    """Wardrobe kept in a single JSON file next to the photos. Fine for one person's clothes."""

    def __init__(self, data_dir: Path):
        self.path = data_dir / "wardrobe.json"
        self.photos_dir = data_dir / "photos"
        self.photos_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _load(self) -> list[Item]:
        if not self.path.exists():
            return []
        return [Item(**raw) for raw in json.loads(self.path.read_text())]

    def _save(self, items: list[Item]) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps([i.model_dump() for i in items], indent=2))
        tmp.replace(self.path)

    def all(self) -> list[Item]:
        with self._lock:
            return self._load()

    def add(self, tags: Tags, photo_bytes: bytes, ext: str) -> Item:
        item_id = uuid.uuid4().hex[:12]
        photo_name = f"{item_id}{ext}"
        (self.photos_dir / photo_name).write_bytes(photo_bytes)
        item = Item(id=item_id, photo=photo_name, **tags.model_dump())
        with self._lock:
            items = self._load()
            items.append(item)
            self._save(items)
        return item

    def update(self, item_id: str, changes: ItemUpdate) -> Item | None:
        with self._lock:
            items = self._load()
            for idx, item in enumerate(items):
                if item.id == item_id:
                    updated = item.model_copy(update=changes.model_dump(exclude_none=True))
                    items[idx] = Item(**updated.model_dump())  # re-validate
                    self._save(items)
                    return items[idx]
        return None

    def delete(self, item_id: str) -> bool:
        with self._lock:
            items = self._load()
            keep = [i for i in items if i.id != item_id]
            if len(keep) == len(items):
                return False
            gone = next(i for i in items if i.id == item_id)
            (self.photos_dir / gone.photo).unlink(missing_ok=True)
            self._save(keep)
            return True

    def mark_worn(self, item_ids: list[str], day: str) -> list[Item]:
        with self._lock:
            items = self._load()
            for item in items:
                if item.id in item_ids:
                    item.last_worn = day
            self._save(items)
            return items
