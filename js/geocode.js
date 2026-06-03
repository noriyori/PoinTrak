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

/* ============================================================
   Travel-time estimation between two located points.
   Uses the free OSRM demo router (driving), with a
   straight-line (haversine) fallback if it's unreachable.
   Results are cached so the timeline doesn't re-query.
   ============================================================ */
const routeCache = {};

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Estimated driving time between two {lat,lng} points.
 * Returns { minutes, km, estimated } where estimated=true means the
 * fallback distance heuristic was used (router unavailable).
 */
async function travelMinutes(from, to) {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}->${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  if (routeCache[key]) return routeCache[key];

  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const route = data.routes && data.routes[0];
      if (route) {
        const result = {
          minutes: Math.round(route.duration / 60),
          km: route.distance / 1000,
          estimated: false,
        };
        routeCache[key] = result;
        return result;
      }
    }
  } catch (e) {
    /* fall through to heuristic */
  }

  // Fallback: assume ~50 km/h effective driving speed with a 25% real-world buffer.
  const km = haversineKm(from, to);
  const result = { minutes: Math.round((km / 50) * 60 * 1.25), km, estimated: true };
  routeCache[key] = result;
  return result;
}
