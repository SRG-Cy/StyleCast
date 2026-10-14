from typing import Literal, Optional

from pydantic import BaseModel, Field

Category = Literal["top", "bottom", "dress", "outerwear", "shoes", "accessory"]
Formality = Literal["casual", "smart", "sporty"]


class Tags(BaseModel):
    name: str = Field(description="Short name, e.g. 'navy wool jumper'")
    category: Category
    colour: str
    warmth: int = Field(ge=1, le=3, description="1 = light, 2 = medium, 3 = warm")
    waterproof: bool
    formality: Formality


class Item(Tags):
    id: str
    photo: str
    in_wash: bool = False
    last_worn: Optional[str] = None  # ISO date


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[Category] = None
    colour: Optional[str] = None
    warmth: Optional[int] = Field(default=None, ge=1, le=3)
    waterproof: Optional[bool] = None
    formality: Optional[Formality] = None
    in_wash: Optional[bool] = None


class Weather(BaseModel):
    date: str
    temp_min: float
    temp_max: float
    rain_chance: int
    wind_kmh: float
    summary: str


class OutfitRequest(BaseModel):
    occasion: Formality = "casual"
    lat: Optional[float] = None
    lon: Optional[float] = None


class Outfit(BaseModel):
    item_ids: list[str]
    reason: str
    weather: Weather
    gaps: list[str] = []


class WearRequest(BaseModel):
    item_ids: list[str]
