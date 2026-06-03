/* ============================================================
   geocode.js — turn a place name into coordinates
   Uses OpenStreetMap's Nominatim (free, no API key).
   Be polite: cache results and debounce lookups.
   ============================================================ */

const geoCache = {};

/**
 * Look up a place. Returns { lat, lng, label } or null.
 */
async function geocode(query) {
  const q = (query || "").trim();
  if (!q) return null;
  if (geoCache[q]) return geoCache[q];

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(q);

  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": navigator.language || "en" },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data.length) return null;
    const hit = data[0];
    const result = {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      label: hit.display_name,
    };
    geoCache[q] = result;
    return result;
  } catch (e) {
    console.warn("Geocode failed:", e);
    return null;
  }
}

/** Debounce helper for live lookups while typing. */
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
