import httpx

from .models import Weather

# WMO weather codes -> short words (subset that matters for dressing).
_CODES = {
    0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "fog",
    51: "drizzle", 53: "drizzle", 55: "drizzle",
    61: "rain", 63: "rain", 65: "heavy rain",
    71: "snow", 73: "snow", 75: "heavy snow",
    80: "showers", 81: "showers", 82: "heavy showers",
    95: "thunderstorm",
}


def today(lat: float, lon: float) -> Weather:
    resp = httpx.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": lat,
            "longitude": lon,
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
            "timezone": "auto",
            "forecast_days": 1,
        },
        timeout=15,
    )
    resp.raise_for_status()
    d = resp.json()["daily"]
    return Weather(
        date=d["time"][0],
        temp_min=d["temperature_2m_min"][0],
        temp_max=d["temperature_2m_max"][0],
        rain_chance=d["precipitation_probability_max"][0] or 0,
        wind_kmh=d["wind_speed_10m_max"][0],
        summary=_CODES.get(d["weather_code"][0], "mixed"),
    )
