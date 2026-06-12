// PoinTrak — Today & Tomorrow (Scriptable widget, Large)
// Shows today's and tomorrow's trip events, straight from the shared Firebase
// room. Before the trip starts it previews the first two days instead.
//
// SETUP (one time):
//   1. Install "Scriptable" from the App Store.
//   2. Open Scriptable → ＋ → paste this whole file → name it "PoinTrak".
//   3. Long-press the Home Screen → ＋ → Scriptable → add a LARGE widget.
//   4. Long-press the widget → Edit Widget → Script: PoinTrak.
//   Tapping the widget opens the PoinTrak site.

// ---------- config ----------
const DB = "https://trippz-68e73-default-rtdb.firebaseio.com"; // your Firebase DB
const ROOM = "our-trip";          // must match POINTRAK_ROOM in the app
const SITE = "https://noriyori.github.io/PoinTrak/";
const ROWS_PER_DAY = 4;           // items per day before "+N more"

// ---------- theme ----------
const BG = new Color("#0e1622");
const TEXT = new Color("#eaf0f8");
const MUTED = new Color("#93a4bd");
const ACCENT = new Color("#3b82f6");

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
function addDays(key, n) { const d = parseDay(key); d.setDate(d.getDate() + n); return iso(d); }
function todayKey() { return iso(new Date()); }
function fmtDay(key) {
  return parseDay(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function dayHeading(key) {
  const t = todayKey();
  if (key === t) return "Today";
  if (key === addDays(t, 1)) return "Tomorrow";
  return fmtDay(key);
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

function itemsForDay(trip, key) {
  return trip.items
    .filter((it) => it.date && spanStart(it) <= key && key <= spanEnd(it))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function whenLabel(it, key) {
  if (it.type === "hotel") {
    if (it.date === key) return it.time ? `Check-in ${it.time}` : "Check-in";
    if (spanEnd(it) === key) return it.endTime ? `Check-out ${it.endTime}` : "Check-out";
    return "Overnight";
  }
  if (it.allDay) return "All day";
  return startTimeOf(it) || "";
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

// ---------- widget UI ----------
function addDaySection(w, trip, key) {
  const head = w.addStack();
  head.centerAlignContent();
  const h = head.addText(dayHeading(key));
  h.font = Font.boldSystemFont(15);
  h.textColor = ACCENT;
  head.addSpacer(8);
  const d = head.addText(fmtDay(key));
  d.font = Font.systemFont(11);
  d.textColor = MUTED;
  w.addSpacer(4);

  const list = itemsForDay(trip, key);
  if (!list.length) {
    const none = w.addText("No plans.");
    none.font = Font.systemFont(12);
    none.textColor = MUTED;
    return;
  }
  const shown = list.slice(0, ROWS_PER_DAY);
  for (const it of shown) {
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.setPadding(3, 0, 3, 0);

    const ic = row.addText(itemIcon(it));
    ic.font = Font.systemFont(14);
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
}

function buildWidget(trip) {
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.setPadding(14, 15, 12, 15);
  w.url = SITE;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  // Top line: trip name + countdown
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
  w.addSpacer(10);

  // Anchor on today; before the trip, preview from the start date instead.
  let day1 = todayKey();
  if (trip.meta.start && day1 < trip.meta.start) day1 = trip.meta.start;
  const day2 = addDays(day1, 1);

  addDaySection(w, trip, day1);
  w.addSpacer(10);
  addDaySection(w, trip, day2);

  w.addSpacer();
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

const widget = buildWidget(trip);
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentLarge();
}
Script.complete();
