from . import config
from .models import Tags
from .ollama import chat_json

TAG_PROMPT = """You are tagging one clothing item for a personal wardrobe app.
Look at the photo and describe the single main clothing item.

- name: a short everyday name with colour and material if visible, e.g. "navy wool jumper"
- category: top, bottom, dress, outerwear (coats/jackets), shoes, or accessory
- colour: the main colour in one or two words
- warmth: 1 = light (t-shirt, shorts), 2 = medium (shirt, jeans, light jacket), 3 = warm (jumper, wool coat, boots)
- waterproof: true only for rain jackets, raincoats, wellies or clearly waterproof boots
- formality: casual, smart (office/going out) or sporty (gym/running)
"""


def tag_photo(photo: bytes) -> Tags:
    if config.MOCK:
        return Tags(name="new item", category="top", colour="unknown", warmth=2, waterproof=False, formality="casual")
    raw = chat_json(config.VISION_MODEL, TAG_PROMPT, Tags.model_json_schema(), image=photo)
    return Tags(**raw)
