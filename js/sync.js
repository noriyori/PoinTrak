/* ============================================================
   sync.js — optional realtime sync via Firebase Realtime Database

   If js/firebase-config.js has real values, the whole trip is mirrored
   to a shared "room" and edits from any device appear live. If not, the
   app silently falls back to localStorage + share links — no errors.

   Sync model:
   - Reads: one listener on the room. Remote is the source of truth, so
     it REPLACES local state (this is what makes deletes propagate).
   - Writes: granular per-item (items/suggestions/checklist keyed by id),
     so two people editing different things never clobber each other.
   - On first join we union local + remote once, so pre-sync data isn't lost.
   ============================================================ */

let _db = null;
let _roomRef = null;
let _applyingRemote = false; // guard: don't echo remote changes back up

function syncEnabled() {
  return !!_roomRef;
}

function syncConfigured() {
  const c = window.FIREBASE_CONFIG;
  return !!(c && c.apiKey && !c.apiKey.startsWith("PASTE") && c.databaseURL);
}

/* ---------- trip <-> database shape ---------- */
function listToMap(list) {
  const m = {};
  for (const x of list || []) if (x && x.id) m[x.id] = stripUndefined(x);
  return m;
}
function mapToList(map) {
  return map ? Object.values(map) : [];
}
function stripUndefined(obj) {
  // Firebase rejects `undefined`; convert to null / drop.
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

function tripToDb(t) {
  return {
    meta: {
      name: t.name || "",
      start: t.start || "",
      end: t.end || "",
      link: t.link || "",
      collaborators: t.collaborators || [],
      sectionLinks: t.sectionLinks || {},
    },
    items: listToMap(t.items),
    suggestions: listToMap(t.suggestions),
    checklist: listToMap(t.checklist),
  };
}

function dbToTrip(data) {
  const meta = data.meta || {};
  return {
    ...blankTrip(),
    name: meta.name || "",
    start: meta.start || "",
    end: meta.end || "",
    link: meta.link || "",
    collaborators: meta.collaborators || [],
    sectionLinks: meta.sectionLinks || {},
    items: mapToList(data.items),
    suggestions: mapToList(data.suggestions),
    checklist: mapToList(data.checklist),
  };
}

function hasLocalData() {
  return (
    trip.items.length || trip.suggestions.length || trip.checklist.length || trip.name
  );
}

/* ---------- boot ---------- */
function initSync() {
  if (!syncConfigured()) {
    setSyncStatus(false);
    return;
  }
  if (typeof firebase === "undefined") {
    console.warn("Firebase SDK not loaded; staying offline.");
    setSyncStatus(false);
    return;
  }
  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    _db = firebase.database();
    const room = window.POINTRAK_ROOM || "our-trip";
    _roomRef = _db.ref("pointrak/" + room);

    // First, reconcile what's already there with anything we have locally.
    _roomRef
      .once("value")
      .then((snap) => {
        const remote = snap.val();
        if (!remote) {
          if (hasLocalData()) _roomRef.set(tripToDb(trip)); // seed empty room
        } else if (hasLocalData()) {
          // One-time union so nobody's pre-sync work is dropped.
          const remoteTrip = dbToTrip(remote);
          const merged = mergeTrips(remoteTrip, trip);
          _roomRef.set(tripToDb(merged));
        }
        // Henceforth, remote is the source of truth.
        _roomRef.on("value", (s) => applyRemote(s.val()));
        setSyncStatus(true, room);
      })
      .catch((e) => {
        console.warn("Sync init failed:", e);
        setSyncStatus(false);
      });
  } catch (e) {
    console.warn("Could not start Firebase:", e);
    setSyncStatus(false);
  }
}

function applyRemote(data) {
  if (!data) return;
  _applyingRemote = true;
  const incoming = dbToTrip(data);
  // keep our own identity in the collaborators list
  const me = getMe();
  if (me && !incoming.collaborators.includes(me)) incoming.collaborators.push(me);
  trip = incoming;
  saveLocalOnly();
  renderAll();
  if (typeof refreshOpenComments === "function") refreshOpenComments();
  _applyingRemote = false;
}

/** Persist to localStorage without triggering a sync push (used for remote echoes). */
function saveLocalOnly() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
  } catch (_) {}
  if (typeof onTripSaved === "function") onTripSaved();
}

/* ---------- granular writers (called by mutations) ---------- */
function syncSet(collection, item) {
  if (!syncEnabled() || _applyingRemote) return;
  _roomRef.child(collection + "/" + item.id).set(stripUndefined(item));
}
function syncRemove(collection, id) {
  if (!syncEnabled() || _applyingRemote) return;
  _roomRef.child(collection + "/" + id).remove();
}
const syncMeta = debounce((meta) => {
  if (!syncEnabled() || _applyingRemote) return;
  _roomRef.child("meta").update(meta);
}, 400);

/* ---------- status line ---------- */
function setSyncStatus(on, room) {
  const s = document.getElementById("save-status");
  if (!s) return;
  s.dataset.live = on ? "1" : "0";
  s.textContent = on
    ? `🟢 Live sync on · room "${room}"`
    : "Saved locally (live sync off)";
}
