// Today's forecast from Open-Meteo (free, no key, works straight from the browser).

// WMO weather codes -> short words (the ones that matter for dressing).
const CODES = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "fog",
  51: "drizzle", 53: "drizzle", 55: "drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
  61: "rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
  71: "snow", 73: "snow", 75: "heavy snow", 77: "snow",
  80: "showers", 81: "showers", 82: "heavy showers", 85: "snow showers", 86: "snow showers",
  95: "thunderstorm", 96: "thunderstorm", 99: "thunderstorm",
};

// Galway, used when the browser won't share a location.
export const DEFAULT_PLACE = { lat: 53.2707, lon: -9.0568 };

const SAVED = "stylecast-last-forecast";

// The live forecast, or the last one saved on this device when offline (marked with offline: true).
export async function today(place = DEFAULT_PLACE) {
  try {
    const w = await fetchToday(place);
    try { localStorage.setItem(SAVED, JSON.stringify(w)); } catch {}
    return w;
  } catch (err) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SAVED)); } catch {}
    if (saved) return { ...saved, offline: true };
    throw navigator.onLine === false ? new Error("You're offline and there's no saved forecast yet.") : err;
  }
}

// The last forecast saved on this device, or null. No network and no location prompt.
export function lastSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED)); } catch { return null; }
}

async function fetchToday({ lat, lon }) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
    timezone: "auto",
    forecast_days: 1,
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Couldn't get the weather (${res.status}).`);
  const d = (await res.json()).daily;
  return {
    date: d.time[0],
    tempMin: d.temperature_2m_min[0],
    tempMax: d.temperature_2m_max[0],
    rainChance: d.precipitation_probability_max[0] ?? 0,
    windKmh: d.wind_speed_10m_max[0],
    summary: CODES[d.weather_code[0]] ?? "mixed",
  };
}

export function position() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(DEFAULT_PLACE);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(DEFAULT_PLACE),
      { timeout: 5000, maximumAge: 3_600_000 },
    );
  });
}
