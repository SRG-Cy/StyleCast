import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("STYLECAST_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
PHOTOS_DIR = DATA_DIR / "photos"

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
VISION_MODEL = os.environ.get("STYLECAST_VISION_MODEL", "qwen2.5vl:7b")
TEXT_MODEL = os.environ.get("STYLECAST_TEXT_MODEL", "qwen2.5:7b")

# Mock mode skips Ollama so the app can run (and be tested) without a GPU.
MOCK = os.environ.get("STYLECAST_MOCK", "0") == "1"

# Default location: Galway city.
DEFAULT_LAT = float(os.environ.get("STYLECAST_LAT", "53.2707"))
DEFAULT_LON = float(os.environ.get("STYLECAST_LON", "-9.0568"))

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
