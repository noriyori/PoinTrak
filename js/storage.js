/* ============================================================
   storage.js — trip state, persistence, import/export, sharing
   ============================================================ */

const STORAGE_KEY = "pointrak.trip.v1";
const ME_KEY = "pointrak.me";

/** Generate a short unique id. */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** A fresh, empty trip. */
function blankTrip() {
  return {
    version: 1,
    name: "",
    start: "",
    end: "",
    collaborators: [],
    items: [],        // timeline: hotels, events, travel legs, tasks
    suggestions: [],  // proposed activities
    checklist: [],    // planning to-dos
    updated: Date.now(),
  };
}

/** In-memory trip; always go through saveTrip() to persist. */
let trip = loadTrip();

function loadTrip() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn("Could not load trip:", e);
  }
  return blankTrip();
}

/** Keep older saved trips forward-compatible. */
function migrate(t) {
  const base = blankTrip();
  return { ...base, ...t };
}

function saveTrip() {
  trip.updated = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
  } catch (e) {
    console.warn("Could not save trip:", e);
  }
  if (typeof onTripSaved === "function") onTripSaved();
}

/* ---------- Identity (who is editing) ---------- */
function getMe() {
  return localStorage.getItem(ME_KEY) || "";
}
function setMe(name) {
  localStorage.setItem(ME_KEY, name);
  if (name && !trip.collaborators.includes(name)) {
    trip.collaborators.push(name);
    saveTrip();
    if (typeof syncMeta === "function") syncMeta({ collaborators: trip.collaborators });
  }
}

/* ---------- Export / Import ---------- */
function exportTrip() {
  const data = JSON.stringify(trip, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (trip.name || "trip").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  a.href = url;
  a.download = `pointrak-${safe}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importTripFromText(text) {
  const incoming = migrate(JSON.parse(text));
  trip = mergeTrips(trip, incoming);
  saveTrip();
  return trip;
}

/**
 * Merge two trips by id, keeping the most-voted/newest data.
 * This lets collaborators combine files without clobbering each other.
 */
function mergeTrips(a, b) {
  const out = { ...a };
  // Scalar fields: prefer the most recently updated trip's values.
  const newer = (b.updated || 0) > (a.updated || 0) ? b : a;
  out.name = newer.name || a.name || b.name;
  out.start = newer.start || a.start || b.start;
  out.end = newer.end || a.end || b.end;
  out.collaborators = Array.from(new Set([...(a.collaborators || []), ...(b.collaborators || [])]));

  out.items = mergeById(a.items, b.items);
  out.suggestions = mergeById(a.suggestions, b.suggestions, (x, y) => ({
    ...y,
    votes: Math.max(x.votes || 0, y.votes || 0),
  }));
  out.checklist = mergeById(a.checklist, b.checklist);
  return out;
}

function mergeById(listA = [], listB = [], reconcile) {
  const map = new Map();
  for (const x of listA) map.set(x.id, x);
  for (const y of listB) {
    if (map.has(y.id) && reconcile) {
      map.set(y.id, reconcile(map.get(y.id), y));
    } else if (!map.has(y.id)) {
      map.set(y.id, y);
    }
  }
  return Array.from(map.values());
}

/* ---------- Shareable link (URL hash, zero backend) ---------- */
function encodeTripToHash() {
  const json = JSON.stringify(trip);
  // UTF-8 safe base64
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `${location.origin}${location.pathname}#trip=${b64}`;
}

function tryLoadTripFromHash() {
  const m = location.hash.match(/#trip=(.+)$/);
  if (!m) return false;
  try {
    const json = decodeURIComponent(escape(atob(m[1])));
    const incoming = migrate(JSON.parse(json));
    trip = mergeTrips(trip, incoming);
    saveTrip();
    history.replaceState(null, "", location.pathname); // clean the URL
    return true;
  } catch (e) {
    console.warn("Bad share link:", e);
    return false;
  }
}
