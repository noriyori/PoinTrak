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

/** Turn a UTC offset like "+02:00" into a friendly label like "UTC+2". */
function tzLabel(off) {
  if (!off) return "";
  if (off === "Z" || off === "+00:00" || off === "+0000") return "UTC";
  const m = off.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return "";
  return "UTC" + m[1] + parseInt(m[2], 10) + (m[3] !== "00" ? ":" + m[3] : "");
}

/** Resolve an airport code/name (e.g. "ZRH", "JFK") to coordinates. */
async function geocodeAirport(code) {
  if (!code) return null;
  const hit = (await geocode(code + " airport")) || (await geocode(code));
  return hit ? { name: code, lat: hit.lat, lng: hit.lng, label: hit.label } : null;
}

/* ---------- AeroDataBox flight-number lookup (optional, RapidAPI key) ---------- */
function flightLookupEnabled() {
  const k = window.AERODATABOX_RAPIDAPI_KEY;
  return !!(k && !k.startsWith("PASTE"));
}

/**
 * Look up a flight by number (and optional YYYY-MM-DD date).
 * Returns { airline, from, fromName, to, toName, dep:{date,time}, arr:{date,time} }
 * or { error } on failure.
 */
async function lookupFlight(number, date) {
  if (!flightLookupEnabled()) return { error: "no-key" };
  const num = String(number || "").replace(/\s+/g, "");
  if (!num) return { error: "no-number" };

  let url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(num)}`;
  if (date) url += `/${date}`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": window.AERODATABOX_RAPIDAPI_KEY,
        "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
      },
    });
    if (res.status === 404) return { error: "not-found" };
    if (!res.ok) return { error: "http-" + res.status };
    const data = await res.json();
    const arr = Array.isArray(data) ? data : data.flights || [];
    if (!arr.length) return { error: "not-found" };
    const f = arr[0];
    const dep = f.departure || {};
    const ar = f.arrival || {};
    const parse = (st) => {
      const s = (st && (st.local || st.utc)) || "";
      const m = s.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?\s*([+-]\d{2}:?\d{2}|Z)?/);
      return m ? { date: m[1], time: m[2], offset: m[3] || "" } : {};
    };
    const code = (a) => a && (a.iata || a.icao || "");
    const nm = (a) => a && (a.shortName || a.municipalityName || a.name || "");
    return {
      airline: f.airline && f.airline.name,
      from: code(dep.airport),
      fromName: nm(dep.airport),
      to: code(ar.airport),
      toName: nm(ar.airport),
      dep: parse(dep.scheduledTime),
      arr: parse(ar.scheduledTime),
    };
  } catch (e) {
    return { error: "network" };
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
  car:    { label: "Car",     icon: "🚗", color: "#2563eb", speed: null, routed: true },
  train:  { label: "Transit", icon: "🚆", color: "#7c3aed", speed: 60,   routed: false },
  flight: { label: "Flight",  icon: "✈️", color: "#e11d48", speed: 800,  routed: false },
  bike:   { label: "Bike",    icon: "🚲", color: "#059669", speed: 15,   routed: true },
  walk:   { label: "Walk",    icon: "🚶", color: "#d97706", speed: 5,    routed: true },
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

/* ---------- Transitous (keyless public-transit routing, MOTIS 2) ---------- */
function pathKm(coords) {
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    km += haversineKm(
      { lat: coords[i - 1][0], lng: coords[i - 1][1] },
      { lat: coords[i][0], lng: coords[i][1] }
    );
  }
  return km;
}

/** Decode a Google-encoded polyline at the given precision into [lat,lng] pairs. */
function decodePolyline(str, precision) {
  let index = 0, lat = 0, lng = 0, byte = 0;
  const coords = [];
  const factor = Math.pow(10, precision || 5);
  while (index < str.length) {
    let shift = 0, result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

function transitModeLabel(mode) {
  const map = {
    RAIL: "Train", HIGHSPEED_RAIL: "Train", LONG_DISTANCE: "Train", REGIONAL_RAIL: "Train",
    NIGHT_RAIL: "Train", REGIONAL_FAST_RAIL: "Train", SUBWAY: "Metro", METRO: "Metro",
    TRAM: "Tram", BUS: "Bus", COACH: "Coach", FERRY: "Ferry", SUBURBAN: "S-Bahn",
  };
  return map[mode] || mode.charAt(0) + mode.slice(1).toLowerCase().replace(/_/g, " ");
}

/**
 * Public-transit journey from Transitous (free, no API key — trains, metro,
 * tram, bus + walking transfers). Returns the same shape as routeLeg, or null
 * if unavailable/out of coverage. `legs` lists the transit lines/modes used.
 */
async function transitousRoute(from, to) {
  const key = `tr:${from.lat.toFixed(4)},${from.lng.toFixed(4)}->${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  if (routeCache[key]) return routeCache[key];

  try {
    const url =
      `https://api.transitous.org/api/v1/plan?fromPlace=${from.lat},${from.lng}` +
      `&toPlace=${to.lat},${to.lng}&arriveBy=false`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const it = data.itineraries && data.itineraries[0];
      if (it) {
        let coords = [];
        const legs = [];
        for (const leg of it.legs || []) {
          const g = leg.legGeometry;
          if (g && g.points) coords = coords.concat(decodePolyline(g.points, g.precision || 7));
          if (leg.mode && leg.mode !== "WALK") {
            legs.push(leg.routeShortName || transitModeLabel(leg.mode));
          }
        }
        const result = {
          minutes: Math.round(it.duration / 60),
          km: coords.length ? pathKm(coords) : haversineKm(from, to),
          coords: coords.length ? coords : null,
          estimated: false,
          legs,
        };
        routeCache[key] = result;
        return result;
      }
    }
  } catch (e) {
    /* fall through */
  }
  return null;
}

/**
 * Mode-aware travel estimate between two located points.
 * - car/bike/walk: OpenRouteService if configured, else OSRM driving geometry.
 * - transit (train): Transitous (keyless), else a straight-line estimate.
 * Returns { minutes, km, coords, estimated, mode, legs? }.
 */
/** Points along the great-circle arc between two coords (for flight paths). */
function greatCircle(a, b, n = 64) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const lat1 = toRad(a.lat), lon1 = toRad(a.lng), lat2 = toRad(b.lat), lon2 = toRad(b.lng);
  const hav =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(hav)));
  if (!d) return [[a.lat, a.lng], [b.lat, b.lng]];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pts.push([toDeg(Math.atan2(z, Math.hypot(x, y))), toDeg(Math.atan2(y, x))]);
  }
  return pts;
}

async function travelByMode(from, to, mode) {
  const m = TRAVEL_MODES[mode] || TRAVEL_MODES.car;

  if (mode === "flight") {
    const km = haversineKm(from, to);
    // Cruise time + ~45 min for taxi/boarding/descent overhead.
    const minutes = Math.round((km / m.speed) * 60) + 45;
    return { minutes, km, coords: greatCircle(from, to), estimated: true, mode };
  }

  if (mode === "train") {
    const tr = await transitousRoute(from, to);
    if (tr) return { ...tr, mode };
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
