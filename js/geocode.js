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
   Travel modes + route geometry between two located points.
   Road-following geometry comes from the free OSRM demo router
   (driving network, keyless). Bike/Walk reuse that geometry but
   estimate time at their own speed; Train is a straight line.
   Results are cached so the timeline & map don't re-query.
   ============================================================ */
const TRAVEL_MODES = {
  car:   { label: "Car",   icon: "🚗", color: "#2563eb", speed: null, routed: true },
  train: { label: "Train", icon: "🚆", color: "#7c3aed", speed: 80,   routed: false },
  bike:  { label: "Bike",  icon: "🚲", color: "#059669", speed: 15,   routed: true },
  walk:  { label: "Walk",  icon: "🚶", color: "#d97706", speed: 5,    routed: true },
};

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
 * Road-following route between two {lat,lng} points.
 * Returns { minutes, km, coords, estimated } where:
 *   - coords is an array of [lat,lng] following the actual roads
 *     (null if the router was unreachable -> caller draws a straight line)
 *   - minutes/km are the driving figures from the router
 *   - estimated=true means the distance heuristic fallback was used
 */
async function routeLeg(from, to) {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}->${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  if (routeCache[key]) return routeCache[key];

  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const route = data.routes && data.routes[0];
      if (route) {
        const coords = (route.geometry?.coordinates || []).map((c) => [c[1], c[0]]);
        const result = {
          minutes: Math.round(route.duration / 60),
          km: route.distance / 1000,
          coords: coords.length ? coords : null,
          estimated: false,
        };
        routeCache[key] = result;
        return result;
      }
    }
  } catch (e) {
    /* fall through to heuristic */
  }

  // Fallback: straight-line distance, ~50 km/h with a 25% buffer, no geometry.
  const km = haversineKm(from, to);
  const result = { minutes: Math.round((km / 50) * 60 * 1.25), km, coords: null, estimated: true };
  routeCache[key] = result;
  return result;
}

/* ---------- OpenRouteService (optional, true per-mode routing) ---------- */
const ORS_PROFILES = { car: "driving-car", bike: "cycling-regular", walk: "foot-walking" };

function orsEnabled() {
  const k = window.ORS_API_KEY;
  return !!(k && !k.startsWith("PASTE"));
}

/**
 * Per-mode route from OpenRouteService (proper bike/foot networks).
 * Returns the same shape as routeLeg, or null if unavailable.
 */
async function orsRoute(from, to, mode) {
  const profile = ORS_PROFILES[mode];
  if (!orsEnabled() || !profile) return null;

  const key = `ors:${mode}:${from.lat.toFixed(4)},${from.lng.toFixed(4)}->${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  if (routeCache[key]) return routeCache[key];

  try {
    const res = await fetch(
      `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
      {
        method: "POST",
        headers: { Authorization: window.ORS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const feat = data.features && data.features[0];
      const sum = feat && feat.properties && feat.properties.summary;
      if (feat && sum) {
        const coords = (feat.geometry?.coordinates || []).map((c) => [c[1], c[0]]);
        const result = {
          minutes: Math.round(sum.duration / 60),
          km: sum.distance / 1000,
          coords: coords.length ? coords : null,
          estimated: false,
        };
        routeCache[key] = result;
        return result;
      }
    }
  } catch (e) {
    /* fall through to OSRM */
  }
  return null;
}

/**
 * Mode-aware travel estimate between two located points.
 * Prefers OpenRouteService for true car/bike/walk routing; otherwise
 * falls back to OSRM driving geometry with a speed-based time for
 * bike/walk. Train is always a straight-line estimate.
 * Returns { minutes, km, coords, estimated, mode }.
 */
async function travelByMode(from, to, mode) {
  const m = TRAVEL_MODES[mode] || TRAVEL_MODES.car;
  if (!m.routed) {
    // Train (or other non-routed): straight line + speed estimate.
    const km = haversineKm(from, to);
    return { minutes: Math.round((km / m.speed) * 60), km, coords: null, estimated: true, mode };
  }

  const ors = await orsRoute(from, to, mode);
  if (ors) return { ...ors, mode };

  // Fallback: OSRM driving geometry, time adjusted by mode speed.
  const leg = await routeLeg(from, to);
  const minutes = m.speed ? Math.round((leg.km / m.speed) * 60) : leg.minutes;
  return { minutes, km: leg.km, coords: leg.coords, estimated: leg.estimated, mode };
}
