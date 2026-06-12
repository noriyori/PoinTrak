// PoinTrak — Upcoming Events (Scriptable widget, Large)
// Pulls your trip straight from the shared Firebase room and lists what's next.
//
// SETUP (one time):
//   1. Install "Scriptable" from the App Store.
//   2. Open Scriptable → ＋ → paste this whole file → name it "PoinTrak".
//   3. Long-press the Home Screen → ＋ → Scriptable → add a LARGE widget.
//   4. Long-press the widget → Edit Widget → Script: PoinTrak.
//   (Optional) Run the script once inside the app to preview it.

// ---------- config ----------
const DB = "https://trippz-68e73-default-rtdb.firebaseio.com"; // your Firebase DB
const ROOM = "our-trip";          // must match POINTRAK_ROOM in the app
const SITE = "https://noriyori.github.io/PoinTrak/";
const MAX_ROWS = 8;               // events to show on the large widget

// ---------- theme ----------
const BG = new Color("#0e1622");
const CARD = new Color("#1b2737");
const TEXT = new Color("#eaf0f8");
const MUTED = new Color("#93a4bd");
const ACCENT = new Color("#3b82f6");

const MODE_ICON = { car: "🚗", train: "🚆", flight: "✈️", bike: "🚲", walk: "🚶" };
const TYPE_ICON = { hotel: "🏨", event: "🎟️", travel: "🚗", task: "✔️" };

function itemIcon(it) {
  if (it.type === "travel") return MODE_ICON[it.legMode || "car"] || "🚗";
  return TYPE_ICON[it.type] || "🎟️";
}

function toDate(d, t) {
  if (!d) return null;
  const time = t && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : "00:00";
  const dt = new Date(`${d}T${time}:00`);
  return isNaN(dt) ? null : dt;
}
function startOf(it) {
  return toDate(it.date, it.type === "travel" ? it.departTime || it.time : it.time);
}
function endOf(it) {
  const d = (it.type === "travel" ? it.arriveDate : it.endDate) || it.date;
  return toDate(d, it.type === "travel" ? it.time : it.endTime || it.time || it.departTime || "23:59");
}

function fmtWhen(it) {
  const s = startOf(it);
  if (!s) return "";
  const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (it.allDay) return `${day} · All day`;
  const startTime = it.type === "travel" ? it.departTime || it.time : it.time;
  return startTime ? `${day} · ${startTime}` : day;
}

async function loadTrip() {
  const req = new Request(`${DB}/pointrak/${encodeURIComponent(ROOM)}.json`);
  req.timeoutInterval = 15;
  const data = await req.loadJSON();
  if (!data) return { meta: {}, items: [] };
  const items = data.items ? Object.values(data.items) : [];
  return { meta: data.meta || {}, items };
}

function countdown(meta) {
  if (!meta.start) return "";
  const start = new Date(meta.start + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const days = Math.round((start - now) / 86400000);
  if (isNaN(days)) return "";
  if (days > 1) return `Starts in ${days} days`;
  if (days === 1) return "Starts tomorrow";
  if (days === 0) return "Starts today";
  if (meta.end && now <= new Date(meta.end + "T00:00:00")) return "On the trip ✈️";
  return "Trip complete";
}

function buildWidget(trip) {
  const now = Date.now();
  const upcoming = trip.items
    .filter((it) => it.date)
    .map((it) => ({ it, s: startOf(it), e: endOf(it) }))
    .filter((x) => x.s && (x.e ? x.e.getTime() : x.s.getTime()) >= now)
    .sort((a, b) => a.s - b.s)
    .slice(0, MAX_ROWS);

  const w = new ListWidget();
  w.backgroundColor = BG;
  w.setPadding(16, 16, 14, 16);
  w.url = SITE;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000); // refresh ~30 min

  // Header
  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText("📍 " + (trip.meta.name || "Your Trip"));
  title.font = Font.boldSystemFont(17);
  title.textColor = TEXT;
  title.lineLimit = 1;
  head.addSpacer();
  const cd = countdown(trip.meta);
  if (cd) {
    const cdt = head.addText(cd);
    cdt.font = Font.mediumSystemFont(11);
    cdt.textColor = ACCENT;
  }
  w.addSpacer(10);

  if (!upcoming.length) {
    const none = w.addText("No upcoming events.");
    none.font = Font.systemFont(13);
    none.textColor = MUTED;
    w.addSpacer();
    return w;
  }

  let lastDay = "";
  for (const { it, s } of upcoming) {
    const dayKey = s.toDateString();
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.setPadding(6, 0, 6, 0);

    const ic = row.addText(itemIcon(it));
    ic.font = Font.systemFont(16);
    row.addSpacer(8);

    const col = row.addStack();
    col.layoutVertically();
    const t = col.addText(it.title || "Untitled");
    t.font = Font.semiboldSystemFont(13);
    t.textColor = TEXT;
    t.lineLimit = 1;
    const subParts = [fmtWhen(it)];
    if (it.location && it.location.name) subParts.push(it.location.name);
    const sub = col.addText(subParts.filter(Boolean).join("  ·  "));
    sub.font = Font.systemFont(11);
    sub.textColor = MUTED;
    sub.lineLimit = 1;

    row.addSpacer();
    lastDay = dayKey;
  }

  w.addSpacer();
  const foot = w.addText("Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  foot.font = Font.systemFont(9);
  foot.textColor = MUTED;
  return w;
}

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
