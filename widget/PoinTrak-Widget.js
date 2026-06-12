// PoinTrak — Day View (Scriptable widget, Large)
// Shows ONE day of your trip at a time, defaulting to today, with tappable
// ◀ / ▶ arrows to step to the previous / next day. Data comes straight from
// the shared Firebase room.
//
// SETUP (one time):
//   1. Install "Scriptable" from the App Store.
//   2. Open Scriptable → ＋ → paste this whole file → name it EXACTLY "PoinTrak"
//      (the ◀ ▶ arrows re-run the script by name, so the name must match).
//   3. Long-press the Home Screen → ＋ → Scriptable → add a LARGE widget.
//   4. Long-press the widget → Edit Widget → Script: PoinTrak.
//
// ABOUT THE ARROWS:
//   Scriptable does NOT support true interactive widgets (iOS 17 Button/Toggle
//   AppIntents aren't exposed to it). The only thing a widget tap can do is open
//   a URL. So ◀ / ▶ open Scriptable, which records the new day and refreshes the
//   widget — you'll see a brief flash of the Scriptable app, then return to the
//   Home Screen. Tapping the middle opens the PoinTrak site.
//   Prefer no flash? Long-press → Edit Widget → Parameter and set a day offset
//   (0 = today, 1 = tomorrow, -1 = yesterday) to pin the widget to one day.

// ---------- config ----------
const DB = "https://trippz-68e73-default-rtdb.firebaseio.com"; // your Firebase DB
const ROOM = "our-trip";          // must match POINTRAK_ROOM in the app
const SITE = "https://noriyori.github.io/PoinTrak/";
const SCRIPT_NAME = "PoinTrak";   // must match this script's name in Scriptable
const MAX_ROWS = 7;               // rows to show before "+N more"

// ---------- theme ----------
const BG = new Color("#0e1622");
const TEXT = new Color("#eaf0f8");
const MUTED = new Color("#93a4bd");
const ACCENT = new Color("#3b82f6");
const PILL = new Color("#1b2737");

const MODE_ICON = { car: "🚗", train: "🚆", transit: "🚆", flight: "✈️", bike: "🚲", walk: "🚶" };
const TYPE_ICON = { hotel: "🏨", event: "🎟️", travel: "🚗", task: "✔️" };

function itemIcon(it) {
  if (it.type === "travel") return MODE_ICON[it.legMode || "car"] || "🚗";
  return TYPE_ICON[it.type] || "🎟️";
}

// ---------- date helpers ----------
function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseDay(key) { return new Date(key + "T00:00:00"); }
function todayKey() { return iso(new Date()); }
function fmtDayLong(key) {
  return parseDay(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function startTimeOf(it) {
  if (it.type === "travel") return it.departTime || it.time || "";
  if (it.allDay) return "";
  return it.time || "";
}
function sortKey(it) {
  if (it.type === "travel") return it.departTime || it.time || "99:99";
  if (it.allDay) return "00:00";
  return it.time || "99:99";
}
/** First / last calendar day an item touches (handles multi-day stays + travel). */
function spanStart(it) { return it.date || ""; }
function spanEnd(it) { return it.endDate || it.arriveDate || it.date || ""; }

// ---------- data ----------
async function loadTrip() {
  const req = new Request(`${DB}/pointrak/${encodeURIComponent(ROOM)}.json`);
  req.timeoutInterval = 15;
  const data = await req.loadJSON();
  if (!data) return { meta: {}, items: [] };
  const items = data.items ? Object.values(data.items) : [];
  return { meta: data.meta || {}, items };
}

/** Every calendar day in the trip range (plus any day an item lands on). */
function tripDays(trip) {
  const set = new Set();
  const itemDates = trip.items.flatMap((i) => [spanStart(i), spanEnd(i)]).filter(Boolean);
  let start = trip.meta.start || (itemDates.length ? itemDates.slice().sort()[0] : "");
  let end = trip.meta.end || (itemDates.length ? itemDates.slice().sort().slice(-1)[0] : "");
  if (start && end) {
    let d = parseDay(start);
    const last = parseDay(end);
    while (d <= last) { set.add(iso(d)); d.setDate(d.getDate() + 1); }
  }
  trip.items.forEach((i) => { if (i.date) set.add(i.date); });
  return [...set].sort();
}

function itemsForDay(trip, key) {
  return trip.items
    .filter((it) => it.date && spanStart(it) <= key && key <= spanEnd(it))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** What to show as the time for an item on a given day. */
function whenLabel(it, key) {
  if (it.type === "hotel") {
    if (it.date === key) return it.time ? `Check-in ${it.time}` : "Check-in";
    if (spanEnd(it) === key) return it.endTime ? `Check-out ${it.endTime}` : "Check-out";
    return "Overnight";
  }
  if (it.allDay) return "All day";
  const t = startTimeOf(it);
  return t || "";
}

// ---------- persisted selected-day state ----------
const fm = FileManager.local();
const STATE = fm.joinPath(fm.cacheDirectory(), "pointrak-widget-state.json");

function loadState() {
  try {
    if (fm.fileExists(STATE)) {
      const s = JSON.parse(fm.readString(STATE));
      // Reset to "today" automatically once a new calendar day starts.
      if (s && s.savedDay === todayKey()) return s;
    }
  } catch (_) {}
  return null;
}
function saveState(key) {
  try { fm.writeString(STATE, JSON.stringify({ key, savedDay: todayKey() })); } catch (_) {}
}

function clampIndex(i, len) { return Math.max(0, Math.min(len - 1, i)); }

/** Resolve which day to show: stored selection → today → nearest trip day. */
function resolveSelectedIndex(days, stateKey) {
  if (!days.length) return -1;
  const target = stateKey || todayKey();
  let idx = days.indexOf(target);
  if (idx >= 0) return idx;
  // Not an exact day: snap to the closest day in range.
  if (target < days[0]) return 0;
  if (target > days[days.length - 1]) return days.length - 1;
  // Inside range but missing (shouldn't happen) — pick first on/after target.
  idx = days.findIndex((d) => d >= target);
  return idx < 0 ? days.length - 1 : idx;
}

// ---------- widget UI ----------
function navURL(delta) {
  return `scriptable:///run/${encodeURIComponent(SCRIPT_NAME)}?nav=${delta}`;
}

function countdown(meta) {
  if (!meta.start) return "";
  const start = parseDay(meta.start);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const days = Math.round((start - now) / 86400000);
  if (isNaN(days)) return "";
  if (days > 1) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  if (days === 0) return "today";
  if (meta.end && now <= parseDay(meta.end)) return "on the trip ✈️";
  return "complete";
}

function buildWidget(trip, days, idx) {
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.setPadding(14, 15, 12, 15);
  w.url = SITE; // middle / background tap opens the site
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  // ----- top line: trip name + countdown -----
  const top = w.addStack();
  top.centerAlignContent();
  const name = top.addText("📍 " + (trip.meta.name || "Your Trip"));
  name.font = Font.semiboldSystemFont(13);
  name.textColor = MUTED;
  name.lineLimit = 1;
  top.addSpacer();
  const cd = countdown(trip.meta);
  if (cd) {
    const c = top.addText(cd);
    c.font = Font.mediumSystemFont(11);
    c.textColor = ACCENT;
    c.lineLimit = 1;
  }

  w.addSpacer(8);

  if (idx < 0) {
    const none = w.addText("No trip dates yet. Add items in PoinTrak.");
    none.font = Font.systemFont(13);
    none.textColor = MUTED;
    w.addSpacer();
    return w;
  }

  const key = days[idx];

  // ----- day nav row: ◀  Tue, Jun 17 · Day x/n  ▶ -----
  const nav = w.addStack();
  nav.centerAlignContent();

  const left = nav.addStack();
  left.setPadding(2, 8, 2, 8);
  left.cornerRadius = 9;
  left.backgroundColor = idx > 0 ? PILL : BG;
  const lt = left.addText("◀");
  lt.font = Font.boldSystemFont(15);
  lt.textColor = idx > 0 ? TEXT : new Color("#3a475c");
  if (idx > 0) left.url = navURL(-1);

  nav.addSpacer();
  const mid = nav.addStack();
  mid.layoutVertically();
  const dlabel = mid.addText(fmtDayLong(key));
  dlabel.font = Font.boldSystemFont(17);
  dlabel.textColor = TEXT;
  dlabel.centerAlignText();
  const dsub = mid.addText(`Day ${idx + 1} of ${days.length}`);
  dsub.font = Font.systemFont(10);
  dsub.textColor = MUTED;
  dsub.centerAlignText();
  nav.addSpacer();

  const right = nav.addStack();
  right.setPadding(2, 8, 2, 8);
  right.cornerRadius = 9;
  right.backgroundColor = idx < days.length - 1 ? PILL : BG;
  const rt = right.addText("▶");
  rt.font = Font.boldSystemFont(15);
  rt.textColor = idx < days.length - 1 ? TEXT : new Color("#3a475c");
  if (idx < days.length - 1) right.url = navURL(1);

  w.addSpacer(8);

  // ----- the day's items -----
  const list = itemsForDay(trip, key);
  if (!list.length) {
    const free = w.addText("No plans this day.");
    free.font = Font.systemFont(13);
    free.textColor = MUTED;
    w.addSpacer();
  } else {
    const shown = list.slice(0, MAX_ROWS);
    for (const it of shown) {
      const row = w.addStack();
      row.layoutHorizontally();
      row.centerAlignContent();
      row.setPadding(4, 0, 4, 0);

      const ic = row.addText(itemIcon(it));
      ic.font = Font.systemFont(15);
      row.addSpacer(8);

      const col = row.addStack();
      col.layoutVertically();
      const t = col.addText(it.title || "Untitled");
      t.font = Font.semiboldSystemFont(13);
      t.textColor = TEXT;
      t.lineLimit = 1;
      const bits = [whenLabel(it, key), it.location && it.location.name].filter(Boolean);
      if (bits.length) {
        const sub = col.addText(bits.join("  ·  "));
        sub.font = Font.systemFont(11);
        sub.textColor = MUTED;
        sub.lineLimit = 1;
      }
      row.addSpacer();
    }
    if (list.length > shown.length) {
      const more = w.addText(`+ ${list.length - shown.length} more`);
      more.font = Font.systemFont(11);
      more.textColor = MUTED;
    }
    w.addSpacer();
  }

  const foot = w.addText("Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  foot.font = Font.systemFont(9);
  foot.textColor = MUTED;
  return w;
}

// ---------- main ----------
let trip;
try {
  trip = await loadTrip();
} catch (e) {
  trip = { meta: { name: "PoinTrak" }, items: [], _error: String(e) };
}

const days = tripDays(trip);
let stateKey = (loadState() || {}).key || null;

// Handle a ◀ / ▶ tap (script run in-app via the scriptable:// URL).
if (!config.runsInWidget) {
  const navParam = args.queryParameters && args.queryParameters.nav;
  if (navParam !== undefined && navParam !== null) {
    const cur = resolveSelectedIndex(days, stateKey);
    const next = clampIndex((cur < 0 ? 0 : cur) + Number(navParam), days.length);
    if (days.length) { stateKey = days[next]; saveState(stateKey); }
  }
}

// An optional static offset set via Edit Widget → Parameter (e.g. 0, 1, -1).
if (config.runsInWidget && args.widgetParameter != null && String(args.widgetParameter).trim() !== "") {
  const off = Number(String(args.widgetParameter).trim());
  if (!isNaN(off)) {
    const base = resolveSelectedIndex(days, todayKey());
    stateKey = days.length ? days[clampIndex((base < 0 ? 0 : base) + off, days.length)] : stateKey;
  }
}

const idx = resolveSelectedIndex(days, stateKey);
const widget = buildWidget(trip, days, idx);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentLarge();
}
Script.complete();
