/* ============================================================
   ui.js — rendering, modals, helpers
   ============================================================ */

const ITEM_TYPES = {
  hotel:  { ic: "bed",    label: "Hotel stay" },
  event:  { ic: "ticket", label: "Event / activity" },
  travel: { ic: "car",    label: "Travel / transport" },
  task:   { ic: "check",  label: "Task / errand" },
};
/** Travel mode → icon name (for SVG icons in HTML contexts). */
const MODE_IC = { car: "car", train: "train", flight: "plane", bike: "bike", walk: "walk" };
/** SVG icon for a travel mode (used by timeline, map, leg pills). */
function modeIcon(mode) { return icon(MODE_IC[mode] || "car"); }

/** Combine a date + time into a datetime-local value ("YYYY-MM-DDTHH:MM"). */
function combineDT(d, t) {
  if (!d) return "";
  const time = t && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : "00:00";
  return `${d}T${time}`;
}
/** Split a datetime-local value back into { date, time }. */
function splitDT(v) {
  if (!v) return { date: "", time: "" };
  const [d, t] = v.split("T");
  return { date: d || "", time: (t || "").slice(0, 5) };
}
/** Whole nights between two YYYY-MM-DD dates (0 if invalid/same day). */
function nightsBetween(d1, d2) {
  if (!d1 || !d2) return 0;
  const a = new Date(d1 + "T00:00:00"), b = new Date(d2 + "T00:00:00");
  const n = Math.round((b - a) / 86400000);
  return n > 0 ? n : 0;
}

/** "Leave" time of a stop (drives the leg to the next stop). */
function departOf(it) {
  if (it.type !== "travel" && it.endTime) return it.endTime; // event/hotel end time
  if (it.departTime) return it.departTime;                   // travel departure / legacy
  if (it.time && it.stay) return shiftTime(it.time, it.stay).time;
  return null;
}

/**
 * When you set out from a stop toward the NEXT one. For a travel item this is
 * its ARRIVAL time (it.time) — you reach the destination, then continue — not
 * its departure. For everything else it matches departOf (end time, etc.).
 */
function onwardDepartOf(it) {
  if (it.type === "travel") {
    if (it.time) return it.stay ? shiftTime(it.time, it.stay).time : it.time;
    return it.departTime || null;
  }
  return departOf(it);
}

/** Flight segments for an item (supports connections); migrates legacy single-flight fields. */
function flightSegments(it) {
  if (Array.isArray(it.flights) && it.flights.length) return it.flights;
  if (it.flightNo || it.fromAir || it.toAir) {
    return [{ no: it.flightNo || "", from: it.fromAir || "", to: it.toAir || "", fromLoc: it.fromLoc, toLoc: it.toLoc }];
  }
  return [];
}

/** Icon for an item — travel items show their transport mode's icon. */
function itemIcon(it) {
  if (it.type === "travel") return modeIcon(it.legMode || "car");
  return icon((ITEM_TYPES[it.type] || ITEM_TYPES.event).ic);
}

/* ---------- People ---------- */
// The trip crew. Each gets a fixed colour so authorship is obvious at a glance.
const USERS = ["Peter", "Niszki", "JS"];
const USER_COLORS = {
  Peter:  "#f472b6", // pink
  Niszki: "#38bdf8", // sky
  JS:     "#34d399", // green
};

function personColor(name) {
  if (USER_COLORS[name]) return USER_COLORS[name];
  // Stable fallback colour for any other name.
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 60%)`;
}

function initials(name) {
  const n = String(name || "?").trim();
  const parts = n.split(/\s+/);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (n.length <= 2) return n.toUpperCase();
  return n[0].toUpperCase();
}

/** A colored avatar chip; pass withName=true to include the name label. */
function avatar(name, withName) {
  if (!name) return "";
  const col = personColor(name);
  return (
    `<span class="avatar" title="${escapeHtml(name)}">` +
    `<span class="dot" style="background:${col}">${escapeHtml(initials(name))}</span>` +
    (withName ? `<span class="nm">${escapeHtml(name)}</span>` : "") +
    `</span>`
  );
}

/* ---------- small helpers ---------- */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/**
 * Build an Apple Maps deep link for a location.
 * On iPhone/Mac this opens the native Apple Maps app; elsewhere the web map.
 * Uses coordinates when available, falling back to a text query.
 */
function appleMapsUrl(loc) {
  if (!loc) return null;
  if (typeof loc.lat === "number") {
    const q = encodeURIComponent(loc.name || loc.label || "Destination");
    return `https://maps.apple.com/?ll=${loc.lat},${loc.lng}&q=${q}`;
  }
  if (loc.name) return `https://maps.apple.com/?q=${encodeURIComponent(loc.name)}`;
  return null;
}

/** A location chip that opens the place in Apple Maps when tapped. */
function locChip(loc) {
  if (!loc || !loc.name) return "";
  const am = appleMapsUrl(loc);
  return am
    ? `<a class="chip chip-link" href="${am}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Open in Apple Maps">${icon("pin")}${escapeHtml(loc.name)}</a>`
    : `<span class="chip">${icon("pin")}${escapeHtml(loc.name)}</span>`;
}

/** Inline location text that opens Apple Maps (for subtitles, not a chip). */
function locInline(loc) {
  if (!loc || !loc.name) return "";
  const am = appleMapsUrl(loc);
  return am
    ? `<a class="loc-inline" href="${am}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Open in Apple Maps">${icon("pin")}${escapeHtml(loc.name)}</a>`
    : `<span class="loc-inline">${icon("pin")}${escapeHtml(loc.name)}</span>`;
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2400);
}

/** Short relative time like "just now", "5m", "3h", "2d". */
function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  if (s < 604800) return Math.round(s / 86400) + "d ago";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ---------- date / ordering ---------- */
function formatWhen(it) {
  const parts = [];
  if (it.date) parts.push(prettyDate(it.date));
  if (it.time) parts.push(it.time);
  if (it.endDate && it.endDate !== it.date) parts.push("→ " + prettyDate(it.endDate));
  return parts.join(" · ");
}

function prettyDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function shortDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Chips describing an item's arrival/departure (with dates), stay + flight. */
/** Normalize a user-typed URL: add https:// if no scheme, blank if empty. */
function normUrl(u) {
  u = (u || "").trim();
  if (!u) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = "https://" + u;
  return u;
}
/** Short host label for a link chip (drops www., trailing path). */
function linkHost(u) {
  try {
    return new URL(normUrl(u)).hostname.replace(/^www\./, "");
  } catch (_) {
    return "link";
  }
}
/** A small icon+text chip. `text` is treated as plain text and escaped. */
function chip(iconName, text, extraCls = "") {
  return `<span class="chip${extraCls ? " " + extraCls : ""}">${iconName ? icon(iconName) : ""}${escapeHtml(text)}</span>`;
}

/** A tappable chip linking out to a URL. */
function linkChip(u) {
  const url = normUrl(u);
  if (!url) return "";
  return `<a class="chip chip-link" href="${escapeHtml(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${escapeHtml(url)}">${icon("link")}${escapeHtml(linkHost(url))}</a>`;
}

function timeChips(it, opts = {}) {
  const s = opts.short;

  // Hotels / events / tasks read as Check-in/out or Start/End (with dates).
  if (it.type !== "travel") {
    const chips = [];
    const overnightNT = it.endDate && it.endDate !== it.date;
    if (it.type === "hotel") {
      if (it.time) chips.push(chip("clock", `${s ? "" : "Check-in "}${it.time}`));
      if (it.endTime || it.endDate) {
        chips.push(chip("depart", `${s ? "" : "Check-out "}${overnightNT ? shortDate(it.endDate) + " " : ""}${it.endTime || ""}`));
      }
      const n = nightsBetween(it.date, it.endDate);
      if (n) chips.push(chip("moon", `${n} night${n > 1 ? "s" : ""}`));
    } else if (it.allDay) {
      chips.push(chip("sun", `${s ? "all day" : "All day"}${overnightNT ? " · ends " + shortDate(it.endDate) : ""}`));
    } else {
      if (it.time) chips.push(chip("clock", `${s ? "" : "Start "}${it.time}`));
      if (it.endTime || it.endDate) {
        chips.push(chip("flag", `${s ? "" : "End "}${overnightNT ? shortDate(it.endDate) + " " : ""}${it.endTime || ""}`));
      }
    }
    return chips;
  }

  // Travel: departure / arrival (+ flight, zone, seat).
  const overnight = it.arriveDate && it.arriveDate !== it.date;
  const dep = departOf(it);

  const arriveChip = it.time
    ? chip("arrive", `${s ? "" : "Arrive "}${overnight ? shortDate(it.arriveDate) + " " : ""}${it.time}`)
    : "";
  const departChip = dep
    ? chip("depart", `${s ? "" : "Depart "}${overnight && it.date ? shortDate(it.date) + " " : ""}${dep}${!s && !it.departTime ? " (auto)" : ""}`)
    : "";
  const stayChip = it.stay ? chip("hourglass", `${s ? "" : "Stay "}${humanDuration(it.stay)}`) : "";
  const segs = it.legMode === "flight" ? flightSegments(it) : [];
  const flightChip = segs.length
    ? chip("plane", segs.map((g) => [g.no, [g.from, g.to].filter(Boolean).join("→")].filter(Boolean).join(" ")).join(", "))
    : "";
  const tzChip = it.tz ? chip("clock", it.tz, "chip-tz") : "";
  const seatBits = [it.resv ? "🎫 " + it.resv : "", it.seat ? "💺 " + it.seat : "", it.cost ? "💰 " + it.cost : ""].filter(Boolean);
  const seatChip = seatBits.length ? chip("seat", seatBits.join(" · ").replace(/🎫 |💺 |💰 /g, "")) : "";

  // Flights/overnight travel read depart→arrive; everything else arrive→stay→depart.
  const order = overnight ? [departChip, arriveChip, tzChip, flightChip, seatChip] : [arriveChip, stayChip, departChip, tzChip, flightChip, seatChip];
  return order.filter(Boolean);
}

/** Timeline items sorted by date then time, undated last. */
/** Start-of-day time used to place an item within its date. */
function sortTimeOf(it) {
  if (it.type === "travel") return it.departTime || it.time || "99:99"; // departure
  if (it.allDay) return "00:00"; // all-day pinned to the top of the day
  return it.time || "99:99"; // start time
}

/** Within-day sort key: a manual `order` (set by drag) wins; otherwise by time. */
function withinDayKey(it) {
  if (typeof it.order === "number") return it.order;
  const t = sortTimeOf(it);
  const [h, m] = t.split(":").map(Number);
  return 1000 + (h * 60 + m); // unordered items sort by time, after any dragged ones
}

function orderedItems() {
  return [...trip.items].sort((a, b) => {
    const da = a.date || "9999", db = b.date || "9999";
    if (da !== db) return da < db ? -1 : 1;
    return withinDayKey(a) - withinDayKey(b);
  });
}

/* ---------- "Now" anchor: past vs upcoming ---------- */
function itemStartDate(it) {
  if (!it.date) return null;
  const t = ((it.type === "travel" ? it.departTime || it.time : it.time) || "00:00").slice(0, 5);
  const d = new Date(it.date + "T" + t + ":00");
  return isNaN(d) ? null : d;
}
function itemEndDate(it) {
  const d = (it.type === "travel" ? it.arriveDate : it.endDate) || it.date;
  if (!d) return null;
  const t = ((it.type === "travel" ? it.time : it.endTime) || it.time || it.departTime || "23:59").slice(0, 5);
  const dt = new Date(d + "T" + t + ":00");
  return isNaN(dt) ? null : dt;
}
function isPastItem(it) {
  const e = itemEndDate(it);
  return e ? e.getTime() < Date.now() : false;
}
/** id of the next upcoming item (earliest start >= now), or null. */
function nextUpItemId() {
  const now = Date.now();
  for (const it of orderedItems()) {
    const s = itemStartDate(it);
    if (s && s.getTime() >= now) return it.id;
  }
  return null;
}

/* ---------- Modal plumbing ---------- */
function openModal(html) {
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal").hidden = false;
}
function closeModal() {
  document.getElementById("modal").hidden = true;
  document.getElementById("modal-body").innerHTML = "";
  _openComments = null;
}

/* ============================================================
   Identity picker — "Who are you?"
   ============================================================ */
function identityPicker() {
  const me = getMe();
  const picks = USERS.map(
    (n) =>
      `<button type="button" class="who-pick ${me === n ? "sel" : ""}" data-name="${escapeHtml(n)}">
        ${avatar(n, true)}
      </button>`
  ).join("");

  openModal(`
    <h2>Who are you?</h2>
    <p class="empty-hint">Pick your name so everyone can see who added, suggested, or voted on what.</p>
    <div class="who-grid">${picks}</div>
    <div class="form-row" style="margin-top:14px">
      <label>Not one of these? Enter a name</label>
      <input id="who-other" placeholder="Your name" value="${me && !USERS.includes(me) ? escapeHtml(me) : ""}" />
    </div>
    <div class="modal-actions">
      <button class="primary" id="who-save">Save</button>
    </div>
  `);

  const commit = (name) => {
    if (!name) return;
    setMe(name);
    closeModal();
    renderAll();
    toast("You're set as " + name);
  };

  document.querySelectorAll(".who-pick").forEach((b) =>
    b.addEventListener("click", () => commit(b.dataset.name))
  );
  document
    .getElementById("who-save")
    .addEventListener("click", () => commit(document.getElementById("who-other").value.trim()));
}

/* ============================================================
   Comments — lightweight discussion threads, reusable for
   timeline items and suggestions alike.
   ============================================================ */
let _openComments = null; // { collection, id }

function findEntity(collection, id) {
  return (trip[collection] || []).find((x) => x.id === id);
}

function commentListHtml(entity) {
  const comments = entity.comments || [];
  if (!comments.length)
    return `<p class="empty-hint">No comments yet — start the discussion 👇</p>`;
  return comments
    .map(
      (c) => `
      <div class="cmt">
        ${avatar(c.by, false)}
        <div class="cmt-body">
          <div class="cmt-head">
            <span class="cmt-name">${escapeHtml(c.by || "?")}</span>
            <span class="cmt-time">${timeAgo(c.ts)}</span>
          </div>
          <div class="cmt-text">${escapeHtml(c.text)}</div>
        </div>
      </div>`
    )
    .join("");
}

function commentsModal(collection, id) {
  const entity = findEntity(collection, id);
  if (!entity) return;
  _openComments = { collection, id };
  const me = getMe();
  const titleIcon =
    collection === "items" ? itemIcon(entity) : icon("sparkles");

  openModal(`
    <h2>${titleIcon} ${escapeHtml(entity.title)}</h2>
    <div class="cmt-thread">${commentListHtml(entity)}</div>
    <form id="cmt-form" class="inline-form">
      <input id="cmt-input" autocomplete="off"
        placeholder="${me ? "Comment as " + escapeHtml(me) + "…" : "Add a comment…"}" />
      <button class="primary" type="submit">Send</button>
    </form>
  `);

  const thread = document.querySelector(".cmt-thread");
  if (thread) thread.scrollTop = thread.scrollHeight;

  document.getElementById("cmt-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("cmt-input");
    const v = input.value.trim();
    if (!v) return;
    addComment(collection, id, v);
    input.value = "";
    refreshOpenComments();
  });
}

/** Live-update an open comment thread (used after remote sync changes). */
function refreshOpenComments() {
  if (!_openComments) return;
  const wrap = document.querySelector(".cmt-thread");
  if (!wrap) {
    _openComments = null;
    return;
  }
  const entity = findEntity(_openComments.collection, _openComments.id);
  if (!entity) {
    closeModal();
    return;
  }
  wrap.innerHTML = commentListHtml(entity);
  wrap.scrollTop = wrap.scrollHeight;
}

/* ============================================================
   Item editor (add / edit timeline entries)
   ============================================================ */
function itemEditor(existing, defaults) {
  const it = existing || { type: "event", ...(defaults || {}) };
  const initialTravelTiming = it.type === "travel" || it.legMode === "flight";
  const initialHotelTiming = it.type === "hotel" && !initialTravelTiming;
  const initialEventTiming = !initialTravelTiming && it.type !== "hotel";
  const typeButtons = Object.entries(ITEM_TYPES)
    .map(
      ([key, meta]) => `
      <button type="button" class="type-opt ${it.type === key ? "sel" : ""}" data-type="${key}">
        <span class="type-opt-ic">${icon(meta.ic)}</span>${meta.label}
      </button>`
    )
    .join("");

  openModal(`
    <h2>${existing ? "Edit" : "Add to"} itinerary</h2>
    <div class="type-picker">${typeButtons}</div>
    <form id="item-form">
      <div class="form-row">
        <label>Title</label>
        <input id="f-title" required placeholder="e.g. Pick up rental car" value="${escapeHtml(it.title || "")}" />
      </div>
      <div class="form-row">
        <label>Transportation <span class="lbl-soft">— how you get to this stop</span></label>
        <select id="f-mode">${modeOptions(it.legMode || "car")}</select>
      </div>
      <div class="form-row" id="flight-row" ${it.legMode === "flight" ? "" : "hidden"}>
        <label>Flights <span class="lbl-soft">— add a row per flight (e.g. connections)</span></label>
        <div id="flight-segs"></div>
        <div class="flight-row-actions">
          <button type="button" id="add-seg" class="ghost">+ Add another flight</button>
          ${flightLookupEnabled() ? `<button type="button" id="search-flight" class="ghost">🔍 Search by route</button>` : ""}
        </div>
        <div id="flight-search" hidden></div>
        <div class="form-grid3" style="margin-top:10px">
          <input id="f-resv" placeholder="Reservation code" value="${escapeHtml(it.resv || "")}" />
          <input id="f-seat" placeholder="Seat (e.g. 14C)" value="${escapeHtml(it.seat || "")}" />
          <input id="f-seatclass" placeholder="Class" value="${escapeHtml(it.seatClass || "")}" />
        </div>
        <input id="f-cost" placeholder="Total cost (optional)" value="${escapeHtml(it.cost || "")}" style="margin-top:8px" />
      </div>
      <!-- TRAVEL timing (departure / arrival + flight) -->
      <div class="form-grid" id="timing-travel" ${initialTravelTiming ? "" : "hidden"}>
        <div class="form-row"><label>Departure date</label><input id="f-date" type="date" value="${it.date || ""}" /></div>
        <div class="form-row"><label>Departure time</label><input id="f-depart" type="time" value="${it.departTime || ""}" /></div>
        <div class="form-row"><label>Arrival date <span class="lbl-soft">— if later</span></label><input id="f-arrdate" type="date" value="${it.arriveDate || ""}" /></div>
        <div class="form-row"><label>Arrival time</label><input id="f-time" type="time" value="${it.time || ""}" /></div>
      </div>
      <!-- HOTEL timing (check-in / check-out) -->
      <div id="timing-hotel" ${initialHotelTiming ? "" : "hidden"}>
        <div class="form-grid">
          <div class="form-row"><label>Check-in</label><input id="f-checkin" type="datetime-local" value="${combineDT(it.date, it.time)}" /></div>
          <div class="form-row"><label>Check-out</label><input id="f-checkout" type="datetime-local" value="${combineDT(it.endDate, it.endTime)}" /></div>
        </div>
      </div>
      <!-- EVENT / TASK timing (start / end) -->
      <div id="timing-event" ${initialEventTiming ? "" : "hidden"}>
        <label class="ck-allday"><input type="checkbox" id="f-allday" ${it.allDay ? "checked" : ""} /> All day</label>
        <div class="form-grid">
          <div class="form-row"><label>Starts</label><input id="f-start" type="${it.allDay ? "date" : "datetime-local"}" value="${it.allDay ? (it.date || "") : combineDT(it.date, it.time)}" /></div>
          <div class="form-row"><label>Ends <span class="lbl-soft">— optional</span></label><input id="f-end" type="${it.allDay ? "date" : "datetime-local"}" value="${it.allDay ? (it.endDate || "") : combineDT(it.endDate, it.endTime)}" /></div>
        </div>
      </div>
      <div class="form-row">
        <label>Location / address</label>
        <input id="f-loc" placeholder="e.g. Louvre Museum, Paris" value="${escapeHtml(it.location?.name || "")}" />
        <div class="geo-result" id="geo-out">${
          it.location?.lat ? "📍 Pinned on map" : "Type a place to pin it on the route map."
        }</div>
      </div>
      <div class="form-row">
        <label>Notes</label>
        <textarea id="f-notes" rows="2" placeholder="Confirmation #, who's responsible, etc.">${escapeHtml(it.notes || "")}</textarea>
      </div>
      <div class="form-row">
        <label>Link <span class="lbl-soft">— optional URL</span></label>
        <input id="f-link" type="url" inputmode="url" placeholder="https://… (booking, ticket, website)" value="${escapeHtml(it.link || "")}" />
      </div>
      <div id="linked-checklist"></div>
      <div class="modal-actions">
        ${existing ? '<button type="button" class="ghost" id="f-delete">Delete</button>' : ""}
        <button type="submit" class="primary">${existing ? "Save" : "Add"}</button>
      </div>
    </form>
  `);

  // local working copy of resolved coordinates
  let resolvedLoc = it.location ? { ...it.location } : null;
  let chosenType = it.type;
  let fetchedTz = it.tz || ""; // arrival time-zone label (auto-filled by flight lookup)

  if (existing) renderLinkedChecklist(it.id);

  // Show the right timing fields for the chosen type (and flight mode).
  function updateTimingVisibility() {
    const mode = document.getElementById("f-mode").value;
    const travelTiming = chosenType === "travel" || mode === "flight";
    document.getElementById("timing-travel").hidden = !travelTiming;
    document.getElementById("timing-hotel").hidden = !(chosenType === "hotel" && !travelTiming);
    document.getElementById("timing-event").hidden = !(!travelTiming && chosenType !== "hotel");
    document.getElementById("flight-row").hidden = mode !== "flight";
  }

  // All-day toggle for events/tasks: swap the Start/End inputs between
  // datetime-local and date-only, preserving the date part.
  document.getElementById("f-allday").addEventListener("change", (e) => {
    const allDay = e.target.checked;
    ["f-start", "f-end"].forEach((id) => {
      const inp = document.getElementById(id);
      const cur = inp.value;
      if (allDay) { inp.type = "date"; inp.value = cur ? cur.split("T")[0] : ""; }
      else { inp.type = "datetime-local"; inp.value = cur ? cur + "T09:00" : ""; }
    });
  });

  // type picker
  document.querySelectorAll(".type-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".type-opt").forEach((b) => b.classList.remove("sel"));
      btn.classList.add("sel");
      chosenType = btn.dataset.type;
      updateTimingVisibility();
    });
  });

  document.getElementById("f-mode").addEventListener("change", updateTimingVisibility);

  // flight segments (supports connections: one row per flight)
  let segs = flightSegments(it).map((s) => ({ no: s.no || "", from: s.from || "", to: s.to || "" }));
  if (!segs.length) segs = [{ no: "", from: "", to: "" }];
  function readSegs() {
    segs = [...document.querySelectorAll("#flight-segs .flight-seg")].map((r) => ({
      no: r.querySelector(".seg-no").value.trim(),
      from: r.querySelector(".seg-from").value.trim().toUpperCase(),
      to: r.querySelector(".seg-to").value.trim().toUpperCase(),
    }));
  }
  function renderSegs() {
    const c = document.getElementById("flight-segs");
    const canLookup = flightLookupEnabled();
    c.innerHTML = segs
      .map(
        (s, i) => `<div class="flight-seg">
          <input class="seg-no" placeholder="Flight #" value="${escapeHtml(s.no)}" />
          <input class="seg-from" placeholder="From" value="${escapeHtml(s.from)}" />
          <input class="seg-to" placeholder="To" value="${escapeHtml(s.to)}" />
          ${canLookup ? `<button type="button" class="seg-fetch" data-i="${i}" title="Look up airports & times by flight number">Fetch</button>` : ""}
          <button type="button" class="seg-del" data-i="${i}" title="Remove">×</button>
        </div>`
      )
      .join("");
    c.querySelectorAll(".seg-fetch").forEach((b) =>
      b.addEventListener("click", () => fetchSeg(Number(b.dataset.i), b))
    );
    c.querySelectorAll(".seg-del").forEach((b) =>
      b.addEventListener("click", () => {
        readSegs();
        segs.splice(Number(b.dataset.i), 1);
        if (!segs.length) segs = [{ no: "", from: "", to: "" }];
        renderSegs();
      })
    );
  }
  renderSegs();
  document.getElementById("add-seg").addEventListener("click", () => {
    readSegs();
    segs.push({ no: "", from: "", to: "" });
    renderSegs();
  });

  // Look up a segment's flight number and fill airports/times.
  async function fetchSeg(i, btn) {
    readSegs();
    const no = segs[i] && segs[i].no;
    if (!no) { toast("Enter a flight number in that row first"); return; }
    const date = document.getElementById("f-date").value;
    btn.textContent = "…";
    btn.disabled = true;
    const r = await lookupFlight(no, date);
    btn.textContent = "Fetch";
    btn.disabled = false;
    if (r.error) {
      const msgs = {
        "no-key": "Add an AeroDataBox key to enable lookup",
        "not-found": "No flight found for that number/date",
        network: "Lookup failed (network/CORS)",
      };
      toast(msgs[r.error] || "Lookup failed (" + r.error + ")");
      return;
    }
    applyFlightToSeg(i, r);
    toast(`✈️ ${r.from || "?"} → ${r.to || "?"}${r.airline ? " · " + r.airline : ""}`);
  }

  // Fill segment i (and the item's dep/arrival/tz) from a looked-up flight.
  function applyFlightToSeg(i, r) {
    if (r.no) segs[i].no = r.no;
    if (r.from) segs[i].from = r.from;
    if (r.to) segs[i].to = r.to;
    renderSegs();
    if (i === 0 && r.dep) {
      if (r.dep.date && !document.getElementById("f-date").value) document.getElementById("f-date").value = r.dep.date;
      if (r.dep.time) document.getElementById("f-depart").value = r.dep.time;
    }
    if (i === segs.length - 1 && r.arr) {
      if (r.arr.time) document.getElementById("f-time").value = r.arr.time;
      const depDate = (r.dep && r.dep.date) || document.getElementById("f-date").value;
      if (r.arr.date && depDate && r.arr.date !== depDate) {
        document.getElementById("f-arrdate").value = r.arr.date;
      }
      fetchedTz = tzLabel(r.arr.offset) || fetchedTz;
    }
  }

  // Inline "Search by route" panel.
  const searchBtn = document.getElementById("search-flight");
  if (searchBtn) {
    const panel = document.getElementById("flight-search");
    searchBtn.addEventListener("click", () => {
      if (!panel.hidden) { panel.hidden = true; return; }
      readSegs();
      const last = segs[segs.length - 1] || {};
      panel.hidden = false;
      panel.innerHTML = `
        <div class="flight-search-form">
          <input id="fs-from" placeholder="From (IATA)" value="${escapeHtml(last.from || "")}" />
          <input id="fs-to" placeholder="To (IATA)" value="${escapeHtml(last.to || "")}" />
          <input id="fs-date" type="date" value="${document.getElementById("f-date").value || ""}" />
          <button type="button" id="fs-go" class="primary">Search</button>
        </div>
        <div id="fs-results"></div>`;
      document.getElementById("fs-go").addEventListener("click", runFlightSearch);
    });
  }

  async function runFlightSearch() {
    const from = document.getElementById("fs-from").value;
    const to = document.getElementById("fs-to").value;
    const date = document.getElementById("fs-date").value;
    const out = document.getElementById("fs-results");
    if (!from || !to || !date) { out.innerHTML = `<div class="empty-hint">Enter From, To and a date.</div>`; return; }
    out.innerHTML = `<div class="empty-hint">🔎 Searching ${escapeHtml(from.toUpperCase())} → ${escapeHtml(to.toUpperCase())}…</div>`;
    const r = await searchFlightsByRoute(from, to, date);
    if (r.error) {
      const msg = r.error === "not-found"
        ? "No flights found for that route/date."
        : r.error === "no-key"
        ? "Add an AeroDataBox key to search."
        : "Search unavailable (your plan may not include airport schedules, or CORS blocked it).";
      out.innerHTML = `<div class="empty-hint">${msg} Enter the flight number manually instead.</div>`;
      return;
    }
    out.innerHTML = r.flights
      .map((f, idx) => {
        const dur = f.durationMin ? " · " + humanDuration(f.durationMin) : "";
        return `<button type="button" class="fs-result" data-i="${idx}">
          <span class="fs-airline">${escapeHtml(f.airline || "Flight")}</span>
          <span class="fs-route">↗ ${escapeHtml(f.from)} ${escapeHtml(f.dep.time || "")} → ${escapeHtml(f.to)} ${escapeHtml(f.arr.time || "")}${dur}</span>
          <span class="fs-no">${escapeHtml(f.no || "")}</span>
        </button>`;
      })
      .join("");
    out.querySelectorAll(".fs-result").forEach((b) =>
      b.addEventListener("click", () => {
        const f = r.flights[Number(b.dataset.i)];
        readSegs();
        // replace a single empty row, otherwise append
        if (segs.length === 1 && !segs[0].no && !segs[0].from && !segs[0].to) segs = [];
        segs.push({ no: f.no, from: f.from, to: f.to });
        renderSegs();
        applyFlightToSeg(segs.length - 1, f);
        document.getElementById("flight-search").hidden = true;
        toast(`✈️ Added ${f.airline || ""} ${f.no || ""}`.trim());
      })
    );
  }

  // live geocoding
  const locInput = document.getElementById("f-loc");
  const geoOut = document.getElementById("geo-out");
  const doGeo = debounce(async () => {
    const q = locInput.value.trim();
    if (!q) {
      resolvedLoc = null;
      geoOut.className = "geo-result";
      geoOut.textContent = "Type a place to pin it on the route map.";
      return;
    }
    geoOut.className = "geo-result";
    geoOut.textContent = "🔎 Looking up location…";
    const hit = await geocode(q);
    if (hit) {
      resolvedLoc = { name: q, lat: hit.lat, lng: hit.lng, label: hit.label };
      geoOut.className = "geo-result ok";
      geoOut.textContent = "📍 " + hit.label;
    } else {
      resolvedLoc = { name: q }; // keep text even if not found
      geoOut.className = "geo-result err";
      geoOut.textContent = "Couldn't pin that — it'll still be saved as text.";
    }
  }, 600);
  locInput.addEventListener("input", doGeo);

  document.getElementById("item-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const mode = document.getElementById("f-mode").value;
    const travelTiming = chosenType === "travel" || mode === "flight";
    const allDay = document.getElementById("f-allday").checked;

    // Timing fields depend on which group is active.
    let date = "", time = "", departTime = "", arriveDate = "", endDate = "", endTime = "";
    if (travelTiming) {
      date = document.getElementById("f-date").value;
      time = document.getElementById("f-time").value;            // arrival
      departTime = document.getElementById("f-depart").value;    // departure
      arriveDate = document.getElementById("f-arrdate").value;
    } else if (chosenType === "hotel") {
      const ci = splitDT(document.getElementById("f-checkin").value);
      const co = splitDT(document.getElementById("f-checkout").value);
      date = ci.date; time = ci.time; endDate = co.date; endTime = co.time;
    } else if (allDay) {
      date = document.getElementById("f-start").value; // date-only
      endDate = document.getElementById("f-end").value;
    } else {
      const s = splitDT(document.getElementById("f-start").value);
      const en = splitDT(document.getElementById("f-end").value);
      date = s.date; time = s.time; endDate = en.date; endTime = en.time;
    }

    const data = {
      id: it.id || uid(),
      type: chosenType,
      title: document.getElementById("f-title").value.trim(),
      date, time, departTime, arriveDate, endDate, endTime,
      allDay: !travelTiming && chosenType !== "hotel" && allDay,
      stay: it.stay || 0,
      tz: fetchedTz,
      legMode: mode,
      notes: document.getElementById("f-notes").value.trim(),
      link: normUrl(document.getElementById("f-link").value.trim()),
      location: resolvedLoc,
      done: it.done || false,
      by: it.by || getMe(),
    };
    if (!data.title) return;

    // For flights, capture each segment and geocode its airports for the arc.
    if (data.legMode === "flight") {
      data.resv = document.getElementById("f-resv").value.trim();
      data.seat = document.getElementById("f-seat").value.trim();
      data.seatClass = document.getElementById("f-seatclass").value.trim();
      data.cost = document.getElementById("f-cost").value.trim();
      readSegs();
      const flights = [];
      for (const s of segs) {
        if (!s.no && !s.from && !s.to) continue;
        flights.push({
          no: s.no,
          from: s.from,
          to: s.to,
          fromLoc: await geocodeAirport(s.from),
          toLoc: await geocodeAirport(s.to),
        });
      }
      data.flights = flights;
      // Pin the item at the final destination airport if no location was set.
      const lastTo = flights.length ? flights[flights.length - 1].toLoc : null;
      const lastCode = flights.length ? flights[flights.length - 1].to : "";
      if (!data.location && lastTo) {
        data.location = { name: lastCode, lat: lastTo.lat, lng: lastTo.lng, label: lastTo.label };
      }
    }

    upsertItem(data);
    closeModal();
  });

  const del = document.getElementById("f-delete");
  if (del) del.addEventListener("click", () => {
    deleteItem(it.id);
    closeModal();
  });
}

/* ============================================================
   Suggestion editor
   ============================================================ */
function suggestionEditor() {
  openModal(`
    <h2>Suggest an activity</h2>
    <form id="sugg-form">
      <div class="form-row">
        <label>Idea</label>
        <input id="s-title" required placeholder="e.g. Sunset kayak tour" />
      </div>
      <div class="form-row">
        <label>Location (optional)</label>
        <input id="s-loc" placeholder="e.g. Lake Tahoe" />
        <div class="geo-result" id="s-geo">Type a place to pin it on the map.</div>
      </div>
      <div class="form-row">
        <label>Why / notes</label>
        <textarea id="s-notes" rows="3" placeholder="Add a link, price, or why it'd be fun"></textarea>
      </div>
      <div class="modal-actions">
        <button type="submit" class="primary">Add suggestion</button>
      </div>
    </form>
  `);

  // Live location lookup (same as the itinerary editor) so the suggestion
  // carries real coordinates and shows on the map once accepted.
  let resolvedLoc = null;
  const locInput = document.getElementById("s-loc");
  const geoOut = document.getElementById("s-geo");
  const doGeo = debounce(async () => {
    const q = locInput.value.trim();
    if (!q) {
      resolvedLoc = null;
      geoOut.className = "geo-result";
      geoOut.textContent = "Type a place to pin it on the map.";
      return;
    }
    geoOut.className = "geo-result";
    geoOut.textContent = "🔎 Looking up location…";
    const hit = await geocode(q);
    if (hit) {
      resolvedLoc = { name: q, lat: hit.lat, lng: hit.lng, label: hit.label };
      geoOut.className = "geo-result ok";
      geoOut.textContent = "📍 " + hit.label;
    } else {
      resolvedLoc = { name: q };
      geoOut.className = "geo-result err";
      geoOut.textContent = "Couldn't pin that — it'll still be saved as text.";
    }
  }, 600);
  locInput.addEventListener("input", doGeo);

  document.getElementById("sugg-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("s-title").value.trim();
    if (!title) return;
    const locName = document.getElementById("s-loc").value.trim();
    const location = resolvedLoc || (locName ? { name: locName } : null);
    addSuggestion({
      id: uid(),
      title,
      location,
      notes: document.getElementById("s-notes").value.trim(),
      by: getMe() || "Someone",
      votes: 0,
      voters: [],
      accepted: false,
    });
    closeModal();
  });
}

/**
 * Touch-friendly way to schedule a suggestion: pick a day (or no date)
 * and it's accepted onto the plan. Mirrors the desktop drag-and-drop.
 */
function suggestionDayPicker(id) {
  const s = trip.suggestions.find((x) => x.id === id);
  if (!s) return;
  const days = overviewDayList();
  const buttons =
    `<button class="day-pick" data-date="">📌 Add with no date</button>` +
    days
      .map(
        (d, i) =>
          `<button class="day-pick" data-date="${d}">Day ${i + 1} · ${escapeHtml(prettyDate(d))}</button>`
      )
      .join("");
  openModal(`
    <h2>Add to a day</h2>
    <p class="empty-hint">Schedule “${escapeHtml(s.title)}” — pick a day (you can change the time afterwards).</p>
    <div class="day-pick-list">${buttons}</div>
  `);
  document.querySelectorAll(".day-pick").forEach((b) =>
    b.addEventListener("click", () => {
      const date = b.dataset.date;
      if (date) _overviewDay = date;
      acceptSuggestion(id, date);
      closeModal();
    })
  );
}

/* ============================================================
   Renderers
   ============================================================ */
function renderTimeline() {
  const wrap = document.getElementById("timeline");
  const empty = document.getElementById("timeline-empty");
  const allItems = orderedItems();
  wrap.innerHTML = "";

  // ----- view toggle: all days vs one day -----
  const dayList = overviewDayList();
  const hasUnscheduled = allItems.some((it) => !it.date);
  if (_timelineMode === "day") {
    const valid = _timelineDay === "unscheduled" ? hasUnscheduled : dayList.includes(_timelineDay);
    if (!valid) {
      const today = new Date().toISOString().slice(0, 10);
      _timelineDay = dayList.includes(today) ? today : dayList[0] || (hasUnscheduled ? "unscheduled" : null);
      saveTimelineView();
    }
  }
  const items =
    _timelineMode === "day"
      ? allItems.filter((it) => (_timelineDay === "unscheduled" ? !it.date : it.date === _timelineDay))
      : allItems;

  const idx = dayList.indexOf(_timelineDay);
  const controls = el(`
    <div class="tl-controls">
      <div class="seg-toggle">
        <button class="seg ${_timelineMode === "all" ? "active" : ""}" data-tlmode="all">All days</button>
        <button class="seg ${_timelineMode === "day" ? "active" : ""}" data-tlmode="day">Day by day</button>
      </div>
      ${
        _timelineMode === "day" && _timelineDay
          ? `<div class="dv-nav">
               <button class="dv-arrow" data-tlstep="-1" ${idx <= 0 ? "disabled" : ""}>◀</button>
               <span class="tl-day-label">${escapeHtml(dayLabel(_timelineDay, dayList))}</span>
               <button class="dv-arrow" data-tlstep="1" ${idx < 0 || idx >= dayList.length - 1 ? "disabled" : ""}>▶</button>
             </div>`
          : ""
      }
    </div>
  `);
  controls.querySelectorAll("[data-tlmode]").forEach((b) =>
    b.addEventListener("click", () => {
      _timelineMode = b.dataset.tlmode;
      saveTimelineView();
      renderTimeline();
    })
  );
  controls.querySelectorAll("[data-tlstep]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.hasAttribute("disabled")) return;
      const t = dayList.indexOf(_timelineDay) + Number(b.dataset.tlstep);
      if (t >= 0 && t < dayList.length) { _timelineDay = dayList[t]; saveTimelineView(); renderTimeline(); }
    })
  );
  wrap.appendChild(controls);

  // Day-by-day mode: a Tripsy-style week strip to jump between days.
  if (_timelineMode === "day") {
    const strip = el(`<div class="day-chips tl-daystrip">${dayStripHtml(_timelineDay, { unscheduled: hasUnscheduled })}</div>`);
    strip.querySelectorAll(".day-chip").forEach((b) =>
      b.addEventListener("click", () => { _timelineDay = b.dataset.day; saveTimelineView(); renderTimeline(); })
    );
    wrap.appendChild(strip);
  }

  // Days to render: in All mode show every calendar day in range (incl. empty
  // "free days") plus an Unscheduled bucket; in Day mode just the selected day.
  let dayKeys;
  if (_timelineMode === "day") {
    dayKeys = _timelineDay ? [_timelineDay] : [];
  } else {
    dayKeys = dayList.slice();
    if (hasUnscheduled) dayKeys.push("unscheduled");
  }
  empty.hidden = dayKeys.length > 0 || allItems.length > 0;

  const groups = {};
  for (const it of items) {
    const key = it.date || "unscheduled";
    (groups[key] = groups[key] || []).push(it);
  }

  const nextId = nextUpItemId();
  const todayKey = new Date().toISOString().slice(0, 10);

  for (const key of dayKeys) {
    const isUns = key === "unscheduled";
    const isToday = !isUns && key === todayKey;
    const label = isUns ? "Unscheduled" : prettyDate(key);
    const header = `<div class="day-title">${escapeHtml(label)}${isToday ? ' <span class="day-today">Today</span>' : ""}</div>`;
    const group = el(`<div class="day-group ${isToday ? "day-is-today" : ""}"><div class="day-header">${header}</div></div>`);

    // Hotel multi-day bands: quiet "staying at…" on in-between days, check-out on the last.
    if (!isUns) {
      for (const h of trip.items) {
        if (h.type !== "hotel" || !h.date || !h.endDate || h.endDate <= h.date) continue;
        if (key > h.date && key < h.endDate) {
          group.appendChild(el(`<div class="hotel-band">🏨 Staying at ${escapeHtml(h.title)}</div>`));
        } else if (key === h.endDate) {
          group.appendChild(el(`<div class="hotel-band hotel-checkout">🚪 Check-out · ${escapeHtml(h.title)}${h.endTime ? " · " + escapeHtml(h.endTime) : ""}</div>`));
        }
      }
    }

    const dayItems = groups[key] || [];
    if (!dayItems.length) {
      group.appendChild(el(`<div class="day-empty">${isUns ? "Nothing here yet" : "Free day — nothing planned"}</div>`));
    }
    dayItems.forEach((it, idx) => {
      const chips = timeChips(it);
      // A travel item shows its own estimated journey time ONLY when there's no
      // incoming leg pill (e.g. it opens a new day, like a train from yesterday).
      // When the previous same-day stop feeds into it, that leg pill carries the
      // timing instead, so we skip the chip to avoid duplication.
      if (it.type === "travel" && it.legMode !== "flight" && it.location?.lat != null) {
        const prevSameDay = idx > 0 ? dayItems[idx - 1] : null;
        if (!(prevSameDay && legBetween(prevSameDay, it))) {
          const origin = prevLocatedItem(items, it.id);
          if (origin) chips.push(durChip(origin.id, it.id, it.legMode || "car"));
        }
      }
      if (it.location?.name) chips.push(locChip(it.location));
      if (it.link) chips.push(linkChip(it.link));
      if (it.by) chips.push(`<span class="chip chip-author">added by ${avatar(it.by, true)}</span>`);

      const past = isPastItem(it);
      const isNext = it.id === nextId;
      const card = el(`
        <div class="tl-item ${it.done ? "tl-done" : ""} ${past ? "tl-past" : ""} ${isNext ? "tl-next" : ""}" data-type="${it.type}" data-id="${it.id}" draggable="true">
          <span class="tl-grip" title="Drag to reorder">⠿</span>
          <div class="tl-icon">${itemIcon(it)}</div>
          <div class="tl-main">
            <p class="tl-title">${isNext ? '<span class="next-tag">Next up</span> ' : ""}${escapeHtml(it.title)}</p>
            <div class="tl-meta">${chips.join("")}</div>
            ${it.notes ? `<p class="tl-notes">${escapeHtml(it.notes)}</p>` : ""}
          </div>
          ${thumbHtml(it, "tl-thumb")}
          <div class="tl-actions">
            ${it.location?.name ? `<button data-act="info" title="Place details">ℹ️</button>` : ""}
            <button data-act="comments" title="Comments">💬 ${(it.comments || []).length || ""}</button>
            <button data-act="done">${it.done ? "↺" : "✓"}</button>
            <button data-act="edit">✎</button>
          </div>
        </div>
      `);
      // Tap the row (anywhere but a button/link/grip) to open event details.
      card.addEventListener("click", (e) => {
        if (e.target.closest("button, a, .tl-grip, .tl-actions")) return;
        itemEditor(it);
      });
      card.querySelector('[data-act="edit"]').addEventListener("click", () => itemEditor(it));
      card.querySelector('[data-act="done"]').addEventListener("click", () => toggleItemDone(it.id));
      card.querySelector('[data-act="comments"]').addEventListener("click", () => commentsModal("items", it.id));
      const infoBtn = card.querySelector('[data-act="info"]');
      if (infoBtn) infoBtn.addEventListener("click", () => placeDetailsModal(it));
      wireDragReorder(card, group);
      group.appendChild(card);

      // Travel time, or a "time to leave" gap, to the next stop on the same day.
      // Travel items carry their own duration chip, so don't insert a leg INTO them.
      const next = dayItems[idx + 1];
      if (legBetween(it, next)) {
        group.appendChild(
          el(`<div class="tl-leg leg-slot" data-leg-from="${it.id}" data-leg-to="${next.id}"></div>`)
        );
      }
    });
    wrap.appendChild(group);
  }

  // Fill in travel legs (leave/arrive times + drive) asynchronously.
  annotateLegs(items);
  loadThumbs(wrap);
}

/* ---------- Drag to reorder (within a day) ---------- */
function dragAfterElement(group, y) {
  const els = [...group.querySelectorAll(".tl-item:not(.dragging)")];
  let best = { offset: -Infinity, el: null };
  for (const child of els) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > best.offset) best = { offset, el: child };
  }
  return best.el;
}
function commitDayOrder(group) {
  const ids = [...group.querySelectorAll(".tl-item")].map((c) => c.dataset.id).filter(Boolean);
  if (ids.length) reorderItems(ids);
}
function wireDragReorder(card, group) {
  card.addEventListener("dragstart", (e) => {
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", card.dataset.id); } catch (_) {}
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    commitDayOrder(group);
  });
  if (!group._dndWired) {
    group._dndWired = true;
    group.addEventListener("dragover", (e) => {
      const dragging = group.querySelector(".tl-item.dragging");
      if (!dragging) return; // only reorder cards within their own day
      e.preventDefault();
      const after = dragAfterElement(group, e.clientY);
      if (after == null) group.appendChild(dragging);
      else group.insertBefore(dragging, after);
    });
  }
}

/** Thumbnail markup: use a stored photo (e.g. from Google) directly, else lazy-load from Wikipedia by name. */
function thumbHtml(it, cls) {
  if (it.location?.photo) {
    return `<div class="ptk-thumb ${cls} has-photo" style="background-image:url('${escapeHtml(it.location.photo)}')"></div>`;
  }
  if (it.location?.name) {
    return `<div class="ptk-thumb ${cls}" data-q="${escapeHtml(it.location.name)}"></div>`;
  }
  return "";
}

/** Lazy-load place thumbnails into any .ptk-thumb[data-q] inside root. */
async function loadThumbs(root) {
  if (!root) return;
  for (const el of root.querySelectorAll(".ptk-thumb[data-q]")) {
    const q = el.dataset.q;
    el.removeAttribute("data-q"); // avoid duplicate loads within this render
    let url = await fetchPlacePhoto(q); // Wikipedia first (landmarks/cities)
    if (!url && googlePlacesEnabled()) {
      const r = await googlePlaceDetails(q); // Google for hotels/restaurants/etc.
      if (r && r.photo) url = r.photo;
    }
    if (url && el.isConnected) {
      el.style.backgroundImage = `url("${url}")`;
      el.classList.add("has-photo");
    }
  }
}

/* ============================================================
   Travel legs
   Between two consecutive located stops, show an auto-inserted
   travel leg: the drive (time + distance) plus computed leave/
   arrive times. Departure uses arrival + stay duration when set;
   otherwise it works back from the next stop's arrival time.
   ============================================================ */

function shiftTime(hhmm, deltaMin) {
  const [h, m] = hhmm.split(":").map(Number);
  let total = h * 60 + m + deltaMin;
  let dayOffset = 0;
  while (total < 0) { total += 1440; dayOffset--; }
  while (total >= 1440) { total -= 1440; dayOffset++; }
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return { time: `${hh}:${mm}`, dayOffset };
}

function humanDuration(mins) {
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function modeOptions(selected) {
  return Object.entries(TRAVEL_MODES)
    .map(
      ([k, m]) =>
        `<option value="${k}" ${k === selected ? "selected" : ""}>${m.icon} ${m.label}</option>`
    )
    .join("");
}

function stayOptions(selected) {
  const opts = [0, 15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];
  if (selected && !opts.includes(selected)) opts.push(selected);
  opts.sort((a, b) => a - b);
  return opts
    .map(
      (v) =>
        `<option value="${v}" ${v === selected ? "selected" : ""}>${v === 0 ? "— none —" : humanDuration(v)}</option>`
    )
    .join("");
}

const toMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (v) => {
  v = ((v % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

/** Build the inner HTML for a travel-leg pill from computed figures. */
function buildLegPill(cur, next, minutes, km, estimated, m, legs) {
  const drive = humanDuration(minutes) + (estimated ? " (est.)" : "");
  const dist = km >= 1 ? ` · ${km.toFixed(km < 10 ? 1 : 0)} km` : "";
  const via = legs && legs.length ? ` · via ${escapeHtml([...new Set(legs)].join(", "))}` : "";

  let timing = "";
  let warn = false;
  // When you leave the current stop (arrival for travel, else end/check-out).
  const depart = onwardDepartOf(cur);
  if (depart) {
    const leaveMin = toMin(depart);
    const arriveMin = leaveMin + minutes;
    timing = ` · leave <strong>${fromMin(leaveMin)}</strong> → arrive <strong>${fromMin(arriveMin)}</strong>`;
    if (next.time && arriveMin > toMin(next.time)) {
      warn = true;
      timing += ` · ⚠️ ${humanDuration(arriveMin - toMin(next.time))} late for ${fromMin(toMin(next.time))}`;
    }
  } else if (next.time) {
    // Work backwards from the next arrival.
    const leaveMin = toMin(next.time) - minutes;
    timing = ` · leave by <strong>${fromMin(leaveMin)}</strong> to arrive ${escapeHtml(next.time)}`;
    if (cur.time && leaveMin < toMin(cur.time)) {
      warn = true;
      timing += " · ⚠️ tight";
    }
  }

  const mk = Object.keys(TRAVEL_MODES).find((k) => TRAVEL_MODES[k] === m) || "car";
  return (
    `<span class="leg-pill ${warn ? "leg-warn" : "leg-ok"}">` +
    `${modeIcon(mk)} ~${drive}${dist}${via} to ${escapeHtml(next.title)}${timing}</span>`
  );
}

/**
 * Fill every `.leg-slot` inside `root` with its travel-leg pill.
 * `channel` keeps separate render tokens so the timeline and the
 * overview day view don't cancel each other's async fills.
 */
const _legTokens = {};
async function annotateLegSlots(channel, root, items) {
  if (!root) return;
  const token = (_legTokens[channel] = (_legTokens[channel] || 0) + 1);
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));

  for (const node of root.querySelectorAll(".leg-slot")) {
    const cur = byId[node.dataset.legFrom];
    const next = byId[node.dataset.legTo];
    if (!cur || !next) continue;

    // No computable distance (next has no location, or it's the same spot):
    // show a timing "gap / time to leave" pill instead of a travel estimate.
    const bothLoc = cur.location?.lat != null && next.location?.lat != null;
    if (!bothLoc || sameSpot(cur.location, next.location)) {
      const g = gapPill(cur, next);
      if (g) node.innerHTML = g; else node.remove();
      continue;
    }

    // The mode belongs to the ARRIVING event (how you get to `next`).
    const mode = next.legMode || "car";
    const m = TRAVEL_MODES[mode] || TRAVEL_MODES.car;

    // A flight is represented by its own airport-to-airport arc; show its
    // segments rather than estimating a path between the two stop pins.
    if (mode === "flight") {
      node.innerHTML = flightLegPill(next);
      continue;
    }

    node.innerHTML = `<span class="leg-pill leg-calc">${modeIcon(mode)} estimating ${m.label.toLowerCase()}…</span>`;
    const { minutes, km, estimated, legs } = await travelByMode(cur.location, next.location, mode);
    if (token !== _legTokens[channel]) return; // superseded by a newer render
    if (!node.isConnected) continue; // node replaced during the await
    node.innerHTML = buildLegPill(cur, next, minutes, km, estimated, m, legs);
  }
}

/** A static pill summarising a flight leg (segments). */
function flightLegPill(it) {
  const route = flightSegments(it)
    .map((g) => [g.no, [g.from, g.to].filter(Boolean).join("→")].filter(Boolean).join(" "))
    .join(", ");
  return `<span class="leg-pill leg-ok">${icon("plane")} ${escapeHtml(route || "Flight")} to ${escapeHtml(it.title)}</span>`;
}

/** Two locations resolve to the same spot (within ~11 m). */
function sameSpot(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return false;
  return a.lat.toFixed(4) === b.lat.toFixed(4) && a.lng.toFixed(4) === b.lng.toFixed(4);
}

/** Should a leg/timing pill be shown from cur → next? */
function legBetween(cur, next) {
  if (!next) return false;
  const bothLoc = cur.location?.lat != null && next.location?.lat != null;
  if (bothLoc && !sameSpot(cur.location, next.location)) return true; // real travel leg
  return !!(onwardDepartOf(cur) && !next.allDay && next.time);        // timing-only gap
}

/** A "time to leave / gap" pill for when there's no travel distance to compute. */
function gapPill(cur, next) {
  const leave = onwardDepartOf(cur);
  const start = next.allDay ? "" : next.time;
  if (!leave || !start) return "";
  const diff = toMin(start) - toMin(leave);
  if (diff > 0) return `<span class="leg-pill leg-ok">${icon("clock")} ${humanDuration(diff)} until ${escapeHtml(next.title)} · ${escapeHtml(start)}</span>`;
  if (diff === 0) return `<span class="leg-pill leg-ok">${icon("clock")} right after · ${escapeHtml(next.title)} ${escapeHtml(start)}</span>`;
  return `<span class="leg-pill leg-warn">${icon("clock")} overlaps ${escapeHtml(next.title)} · ${escapeHtml(start)}</span>`;
}

/** The nearest located item before `id` in the ordered list (any earlier day). */
function prevLocatedItem(items, id) {
  const i = items.findIndex((x) => x.id === id);
  for (let j = i - 1; j >= 0; j--) {
    if (items[j].location?.lat != null) return items[j];
  }
  return null;
}

/** Placeholder chip for a travel item's estimated journey time (filled async). */
function durChip(fromId, toId, mode) {
  return `<span class="chip leg-dur" data-from="${fromId}" data-to="${toId}" data-mode="${mode}">${modeIcon(mode)} …</span>`;
}

/** Fill every `.leg-dur` placeholder with its estimated travel time. */
async function annotateDurChips(channel, root, items) {
  if (!root) return;
  const token = (_legTokens[channel] = (_legTokens[channel] || 0) + 1);
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  for (const node of root.querySelectorAll(".leg-dur[data-from]")) {
    const from = byId[node.dataset.from], to = byId[node.dataset.to];
    const mode = node.dataset.mode || "car";
    if (!from?.location || !to?.location) { node.remove(); continue; }
    const { minutes, km, estimated } = await travelByMode(from.location, to.location, mode);
    if (token !== _legTokens[channel]) return;
    if (!node.isConnected) continue;
    const dist = km >= 1 ? ` · ${km.toFixed(km < 10 ? 1 : 0)} km` : "";
    node.innerHTML = `${modeIcon(mode)} ~${humanDuration(minutes)}${estimated ? " est." : ""}${dist}`;
    node.title = `Estimated ${TRAVEL_MODES[mode]?.label || "travel"} time from ${from.title}`;
  }
}

function annotateLegs(items) {
  annotateLegSlots("timeline", document.getElementById("timeline"), items);
  annotateDurChips("timeline-dur", document.getElementById("timeline"), items);
}

function renderSuggestions() {
  const wrap = document.getElementById("suggestions");
  wrap.innerHTML = "";
  const pending = trip.suggestions.filter((s) => !s.accepted).length;
  const badge = document.getElementById("sugg-badge");
  badge.hidden = pending === 0;
  badge.textContent = pending;

  const sorted = [...trip.suggestions].sort((a, b) => (b.votes || 0) - (a.votes || 0));
  for (const s of sorted) {
    const voters = (s.voters || []).filter(Boolean);
    const voterAvatars = voters.length
      ? `<span class="voters" title="Voted: ${escapeHtml(voters.join(", "))}">${voters
          .map((v) => avatar(v, false))
          .join("")}</span>`
      : "";
    const card = el(`
      <div class="card ${s.accepted ? "accepted" : ""}">
        <div class="sugg-tap" title="Tap for full details">
          ${thumbHtml(s, "card-thumb")}
          <h3>${escapeHtml(s.title)}</h3>
          <div class="by">${avatar(s.by || "someone", true)} <span class="by-lbl">suggested</span>${s.location?.name ? " · " + locInline(s.location) : ""}</div>
          ${s.notes ? `<div class="notes">${escapeHtml(s.notes)}</div>` : ""}
        </div>
        <div class="card-foot">
          <button class="vote">👍 ${s.votes || 0}</button>
          ${voterAvatars}
          <button class="mini cmt-btn">💬 ${(s.comments || []).length || ""}</button>
          <span class="spacer"></span>
          ${s.accepted ? '<span class="by">✓ on timeline</span>'
            : '<button class="mini accept">＋ Add to day</button><button class="mini del">Remove</button>'}
        </div>
      </div>
    `);
    card.querySelector(".sugg-tap").addEventListener("click", (e) => {
      if (e.target.closest("a")) return; // let the Apple Maps link work
      suggestionModal(s.id);
    });
    card.querySelector(".vote").addEventListener("click", () => voteSuggestion(s.id));
    card.querySelector(".cmt-btn").addEventListener("click", () => commentsModal("suggestions", s.id));
    if (!s.accepted) {
      card.querySelector(".accept").addEventListener("click", () => suggestionDayPicker(s.id));
      card.querySelector(".del").addEventListener("click", () => removeSuggestion(s.id));
    }
    wrap.appendChild(card);
  }
  loadThumbs(wrap); // lazy-fill suggestion photos (Wikipedia → Google)
}

/* Suggestion details popup — full info + place details + actions. */
async function suggestionModal(id) {
  const s = trip.suggestions.find((x) => x.id === id);
  if (!s) return;
  const loc = s.location || null;
  const photo = loc?.photo || "";
  const votesLine = (s) => {
    const voters = (s.voters || []).filter(Boolean);
    const av = voters.length ? voters.map((v) => avatar(v, false)).join("") : "";
    return `👍 ${s.votes || 0}${av ? " " + av : ""}`;
  };
  openModal(`
    <div id="sg-photo" class="sg-photo ${photo ? "has-photo" : ""}" ${photo ? `style="background-image:url('${escapeHtml(photo)}')"` : ""} data-q="${escapeHtml(loc?.name || "")}"></div>
    <h2>${escapeHtml(s.title)}</h2>
    <div class="by" style="margin:-4px 0 8px">${avatar(s.by || "someone", true)} <span class="by-lbl">suggested</span>${loc?.name ? " · " + locInline(loc) : ""}</div>
    ${s.notes ? `<p class="pd-summary">${escapeHtml(s.notes)}</p>` : ""}
    <div class="sg-votes" id="sg-votes">${votesLine(s)}</div>
    <div id="sg-details">${loc?.name && googlePlacesEnabled() ? '<p class="empty-hint">Loading place details…</p>' : ""}</div>
    <div class="modal-actions">
      <button type="button" class="mini" id="sg-vote">👍 Vote</button>
      <button type="button" class="mini" id="sg-cmt">💬 Comments</button>
      ${s.accepted
        ? '<span class="by">✓ on timeline</span>'
        : '<button type="button" class="mini accept" id="sg-add">＋ Add to day</button><button type="button" class="mini" id="sg-del">Remove</button>'}
      <span class="spacer"></span>
      <button type="button" class="primary" id="sg-close">Done</button>
    </div>
  `);
  document.getElementById("sg-close").addEventListener("click", closeModal);
  document.getElementById("sg-vote").addEventListener("click", () => {
    voteSuggestion(s.id);
    const v = document.getElementById("sg-votes");
    if (v) v.innerHTML = votesLine(trip.suggestions.find((x) => x.id === id) || s);
  });
  document.getElementById("sg-cmt").addEventListener("click", () => commentsModal("suggestions", s.id));
  if (!s.accepted) {
    document.getElementById("sg-add").addEventListener("click", () => suggestionDayPicker(s.id));
    document.getElementById("sg-del").addEventListener("click", () => { removeSuggestion(s.id); closeModal(); });
  }

  // Lazy-fill the banner photo if we don't already have one.
  const ph = document.getElementById("sg-photo");
  if (ph && !photo && loc?.name) {
    let url = await fetchPlacePhoto(loc.name);
    if (!url && googlePlacesEnabled()) {
      const r = await googlePlaceDetails(loc.name);
      if (r && r.photo) url = r.photo;
    }
    if (url && ph.isConnected) { ph.style.backgroundImage = `url("${url}")`; ph.classList.add("has-photo"); }
  }

  // Rich place details (rating, hours, website…) when available.
  if (loc?.name && googlePlacesEnabled()) {
    const r = await googlePlaceDetails([loc.name, loc.label].filter(Boolean).join(" "));
    const box = document.getElementById("sg-details");
    if (!box) return;
    if (r.error) { box.innerHTML = ""; return; }
    const hours = r.hours.length
      ? `<details class="pd-hours"><summary>Opening hours</summary><ul>${r.hours.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul></details>`
      : "";
    box.innerHTML = `
      ${r.rating ? `<div class="pd-rating">★ ${r.rating} <span class="muted">(${r.ratingCount})</span></div>` : ""}
      ${r.summary ? `<p class="pd-summary">${escapeHtml(r.summary)}</p>` : ""}
      ${r.address ? `<div class="pd-line">📍 ${escapeHtml(r.address)}</div>` : ""}
      ${r.phone ? `<div class="pd-line">📞 <a href="tel:${escapeHtml(r.phone.replace(/\s+/g, ""))}">${escapeHtml(r.phone)}</a></div>` : ""}
      ${r.website ? `<div class="pd-line">🔗 <a href="${escapeHtml(r.website)}" target="_blank" rel="noopener">Website ↗</a></div>` : ""}
      ${(() => {
        const am = appleMapsUrl(loc) || (r.address ? "https://maps.apple.com/?q=" + encodeURIComponent(r.address) : "");
        return am ? `<div class="pd-line">${icon("map")} <a href="${am}" target="_blank" rel="noopener">Open in Apple Maps ↗</a></div>` : "";
      })()}
      ${hours}
    `;
  }
}

let _addingSubFor = null; // checklist item id currently showing an "add subtask" input
let _collapsedSections = new Set(JSON.parse(localStorage.getItem("pointrak.collapsedSections") || "[]"));
function isSectionCollapsed(name) { return _collapsedSections.has(name || ""); }
function toggleSectionCollapsed(name) {
  name = name || "";
  if (_collapsedSections.has(name)) _collapsedSections.delete(name);
  else _collapsedSections.add(name);
  try { localStorage.setItem("pointrak.collapsedSections", JSON.stringify([..._collapsedSections])); } catch (_) {}
}

function renderChecklist() {
  const ul = document.getElementById("checklist");
  ul.innerHTML = "";
  const all = trip.checklist;
  const topLevel = all.filter((c) => !c.parentId);
  const childrenOf = (id) => all.filter((c) => c.parentId === id);

  // Populate the section autocomplete list.
  const sectionNames = [];
  for (const c of topLevel) {
    const s = (c.section || "").trim();
    if (s && !sectionNames.includes(s)) sectionNames.push(s);
  }
  const dl = document.getElementById("sections-list");
  if (dl) dl.innerHTML = sectionNames.map((s) => `<option value="${escapeHtml(s)}"></option>`).join("");

  // Section order = first appearance among top-level items.
  const sections = [];
  for (const c of topLevel) {
    const s = c.section || "";
    if (!sections.some((x) => x === s)) sections.push(s);
  }

  for (const section of sections) {
    const inSection = topLevel
      .filter((c) => (c.section || "") === section)
      .sort((a, b) => (a.order ?? 1e6) - (b.order ?? 1e6));
    let total = 0, done = 0;
    for (const it of inSection) {
      total++; if (it.done) done++;
      for (const sub of childrenOf(it.id)) { total++; if (sub.done) done++; }
    }
    const collapsed = isSectionCollapsed(section);
    const secLinkId = (trip.sectionLinks || {})[section];
    const secLinkEv = secLinkId ? trip.items.find((x) => x.id === secLinkId) : null;
    const header = el(`
      <li class="ck-section ${collapsed ? "collapsed" : ""}" data-section="${escapeHtml(section)}">
        <span class="ck-sec-left">
          <span class="ck-chevron">▾</span>
          <span class="ck-section-title">${escapeHtml(section || "General")}</span>
          ${secLinkEv ? `<span class="ck-linkchip" title="Linked event">🔗 ${escapeHtml(secLinkEv.title)}</span>` : ""}
        </span>
        <span class="ck-sec-actions">
          <button class="ck-mini ck-sec-link" title="Link section to an event">🔗</button>
          <button class="ck-mini ck-sec-rename" title="Rename section">✎</button>
          <span class="ck-section-count">${done}/${total}</span>
        </span>
      </li>
    `);
    header.querySelector(".ck-sec-left").addEventListener("click", () => { toggleSectionCollapsed(section); renderChecklist(); });
    header.querySelector(".ck-sec-rename").addEventListener("click", (e) => { e.stopPropagation(); sectionRenamePrompt(section); });
    header.querySelector(".ck-sec-link").addEventListener("click", (e) => { e.stopPropagation(); eventPicker((id) => linkSection(section, id), { allowNone: true }); });
    const slc = header.querySelector(".ck-linkchip");
    if (slc && secLinkEv) slc.addEventListener("click", (e) => { e.stopPropagation(); itemEditor(secLinkEv); });
    ul.appendChild(header);

    if (collapsed) continue;
    for (const it of inSection) {
      ul.appendChild(renderCheckRow(it, false));
      for (const sub of childrenOf(it.id)) ul.appendChild(renderCheckRow(sub, true));
      if (_addingSubFor === it.id) ul.appendChild(renderAddSubRow(it));
    }
  }
}

function renderCheckRow(c, isSub) {
  const linkEv = c.linkedItemId ? trip.items.find((x) => x.id === c.linkedItemId) : null;
  const li = el(`
    <li class="ck-row ${isSub ? "ck-sub" : ""} ${c.done ? "done" : ""}" data-id="${c.id}" ${isSub ? "" : 'draggable="true"'}>
      ${isSub ? "" : `<span class="ck-grip" title="Drag to reorder">⠿</span>`}
      <input type="checkbox" ${c.done ? "checked" : ""} />
      <span class="ck-text">${escapeHtml(c.text)}</span>
      ${linkEv ? `<span class="ck-linkchip" title="Linked event">🔗 ${escapeHtml(linkEv.title)}</span>` : ""}
      ${c.by ? `<span class="ck-author" title="Added by ${escapeHtml(c.by)}">${avatar(c.by, false)}</span>` : ""}
      ${c.assignee ? `<span class="ck-assignee">➜ ${avatar(c.assignee, true)}</span>` : ""}
      <button class="ck-mini ck-link" title="Link to an event">🔗</button>
      ${!isSub ? `<button class="ck-sub-add" title="Add subtask">➕</button>` : ""}
      <button class="ck-del" title="Delete">🗑</button>
    </li>
  `);
  li.querySelector("input").addEventListener("change", () => toggleCheck(c.id));
  li.querySelector(".ck-del").addEventListener("click", () => deleteCheck(c.id));
  li.querySelector(".ck-link").addEventListener("click", () => eventPicker((id) => linkCheck(c.id, id), { allowNone: true }));
  const lc = li.querySelector(".ck-linkchip");
  if (lc && linkEv) lc.addEventListener("click", () => itemEditor(linkEv));
  const subAdd = li.querySelector(".ck-sub-add");
  if (subAdd) subAdd.addEventListener("click", () => {
    _addingSubFor = _addingSubFor === c.id ? null : c.id;
    renderChecklist();
  });
  if (!isSub) wireChecklistDrag(li);
  return li;
}

/* ---------- Checklist drag-to-reorder (within / across sections) ---------- */
function wireChecklistDrag(li) {
  li.addEventListener("dragstart", (e) => {
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", li.dataset.id); } catch (_) {}
  });
  li.addEventListener("dragend", () => {
    li.classList.remove("dragging");
    commitChecklistOrder();
  });
  const ul = document.getElementById("checklist");
  if (ul && !ul._ckDnd) {
    ul._ckDnd = true;
    ul.addEventListener("dragover", (e) => {
      const dragging = ul.querySelector(".ck-row.dragging");
      if (!dragging) return;
      e.preventDefault();
      const after = ckDragAfter(ul, e.clientY);
      if (after == null) ul.appendChild(dragging);
      else ul.insertBefore(dragging, after);
    });
  }
}
function ckDragAfter(ul, y) {
  const els = [...ul.querySelectorAll(".ck-row:not(.ck-sub):not(.dragging)")];
  let best = { offset: -Infinity, el: null };
  for (const child of els) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > best.offset) best = { offset, el: child };
  }
  return best.el;
}
/** Read the checklist DOM and persist each top-level item's section + order. */
function commitChecklistOrder() {
  const ul = document.getElementById("checklist");
  if (!ul) return;
  const updates = [];
  let section = "";
  const counters = {};
  for (const li of ul.children) {
    if (li.classList.contains("ck-section")) { section = li.dataset.section || ""; counters[section] = 0; continue; }
    if (li.classList.contains("ck-row") && !li.classList.contains("ck-sub") && li.dataset.id) {
      updates.push({ id: li.dataset.id, section, order: counters[section] = (counters[section] || 0), });
      counters[section]++;
    }
  }
  reorderChecklist(updates);
}

/** Modal to pick an itinerary event to link to (callback gets the id, "" = none). */
function eventPicker(onPick, opts = {}) {
  const items = orderedItems();
  const rows = items
    .map((it) => `<button type="button" class="day-pick" data-id="${it.id}">${itemIcon(it)} ${escapeHtml(it.title)}${it.date ? ` · ${escapeHtml(shortDate(it.date))}` : ""}</button>`)
    .join("");
  openModal(`
    <h2>Link to an event</h2>
    <p class="empty-hint">Pick the itinerary event to connect this to.</p>
    <div class="day-pick-list">
      ${opts.allowNone ? `<button type="button" class="day-pick" data-id="">✕ No link</button>` : ""}
      ${rows || `<p class="empty-hint">No itinerary events yet.</p>`}
    </div>
  `);
  document.querySelectorAll(".day-pick").forEach((b) =>
    b.addEventListener("click", () => { onPick(b.dataset.id); closeModal(); })
  );
}

/** Modal to rename a checklist section. */
function sectionRenamePrompt(oldName) {
  openModal(`
    <h2>Rename section</h2>
    <div class="form-row">
      <label>Section name</label>
      <input id="sec-rename" value="${escapeHtml(oldName || "")}" placeholder="e.g. Before the trip" />
    </div>
    <div class="modal-actions"><button class="primary" id="sec-rename-save">Save</button></div>
  `);
  const inp = document.getElementById("sec-rename");
  setTimeout(() => inp.focus(), 0);
  const save = () => { renameSection(oldName, inp.value); closeModal(); };
  document.getElementById("sec-rename-save").addEventListener("click", save);
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
}

/* ============================================================
   Place details — rich info (rating, hours, website, phone)
   ============================================================ */
/** Render checklist items linked to an event into #linked-checklist. */
function renderLinkedChecklist(itemId) {
  const box = document.getElementById("linked-checklist");
  if (!box) return;
  const linkedSections = Object.keys(trip.sectionLinks || {}).filter((sec) => trip.sectionLinks[sec] === itemId);
  const map = new Map();
  for (const c of trip.checklist) {
    if (c.parentId) continue;
    if (c.linkedItemId === itemId || linkedSections.includes(c.section || "")) map.set(c.id, c);
  }
  const list = [...map.values()];
  if (!list.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `
    <label>Linked checklist <span class="lbl-soft">— ${list.filter((c) => c.done).length}/${list.length} done</span></label>
    <ul class="linked-ck">${list.map((c) => `
      <li class="${c.done ? "done" : ""}">
        <input type="checkbox" data-id="${c.id}" ${c.done ? "checked" : ""} />
        <span class="lc-text">${escapeHtml(c.text)}</span>
        ${c.section ? `<span class="lc-sec">${escapeHtml(c.section)}</span>` : ""}
      </li>`).join("")}</ul>`;
  box.querySelectorAll('input[type="checkbox"]').forEach((cb) =>
    cb.addEventListener("change", () => { toggleCheck(cb.dataset.id); renderLinkedChecklist(itemId); })
  );
}

async function placeDetailsModal(it) {
  const loc = it.location || {};
  const title = loc.name || it.title || "Place";
  openModal(`
    <h2>${escapeHtml(title)}</h2>
    <div id="pd-body"><p class="empty-hint">${googlePlacesEnabled() ? "Loading place details…" : "Add a Google Places key to see details. Meanwhile:"}</p></div>
    <div class="modal-actions">
      ${appleMapsUrl(loc) ? `<a class="ghost" href="${appleMapsUrl(loc)}" target="_blank" rel="noopener">Apple Maps ↗</a>` : ""}
      <button class="primary" id="pd-close">Done</button>
    </div>
  `);
  document.getElementById("pd-close").addEventListener("click", closeModal);
  if (!googlePlacesEnabled()) return;

  const query = [loc.name, loc.label].filter(Boolean).join(" ") || it.title;
  const r = await googlePlaceDetails(query);
  const body = document.getElementById("pd-body");
  if (!body) return;
  if (r.error) {
    body.innerHTML = `<p class="empty-hint">Couldn't load details (${escapeHtml(r.error)}).</p>`;
    return;
  }
  const hours = r.hours.length
    ? `<details class="pd-hours"><summary>Opening hours</summary><ul>${r.hours.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul></details>`
    : "";
  body.innerHTML = `
    ${r.photo ? `<div class="pd-photo" style="background-image:url('${escapeHtml(r.photo)}')"></div>` : ""}
    ${r.rating ? `<div class="pd-rating">★ ${r.rating} <span class="muted">(${r.ratingCount})</span></div>` : ""}
    ${r.summary ? `<p class="pd-summary">${escapeHtml(r.summary)}</p>` : ""}
    ${r.address ? `<div class="pd-line">📍 ${escapeHtml(r.address)}</div>` : ""}
    ${r.phone ? `<div class="pd-line">📞 <a href="tel:${escapeHtml(r.phone.replace(/\s+/g, ""))}">${escapeHtml(r.phone)}</a></div>` : ""}
    ${r.website ? `<div class="pd-line">🔗 <a href="${escapeHtml(r.website)}" target="_blank" rel="noopener">Website ↗</a></div>` : ""}
    ${r.mapsUri ? `<div class="pd-line">🗺 <a href="${escapeHtml(r.mapsUri)}" target="_blank" rel="noopener">Open in Google Maps ↗</a></div>` : ""}
    ${hours}
  `;
}

/* ============================================================
   City visit — suggest things to do for a location over N days
   ============================================================ */
let _cvPlaces = [];
function cityVisitModal() {
  openModal(`
    <h2>🏙 City visit — things to do</h2>
    <div class="form-row"><label>City / area</label><input id="cv-city" placeholder="e.g. Zurich" /></div>
    <div class="form-grid">
      <div class="form-row"><label>From</label><input id="cv-from" type="date" value="${trip.start || ""}" /></div>
      <div class="form-row"><label>To</label><input id="cv-to" type="date" value="${trip.end || ""}" /></div>
    </div>
    <div class="modal-actions"><button class="primary" id="cv-go">Suggest things to do</button></div>
    <div id="cv-results"></div>
  `);
  document.getElementById("cv-go").addEventListener("click", runCityVisit);
  document.getElementById("cv-city").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runCityVisit(); } });
}

async function runCityVisit() {
  const city = document.getElementById("cv-city").value.trim();
  const from = document.getElementById("cv-from").value;
  const to = document.getElementById("cv-to").value;
  const out = document.getElementById("cv-results");
  if (!city) { out.innerHTML = `<p class="empty-hint">Enter a city or area.</p>`; return; }
  let nDays = 1;
  if (from && to) { const d = Math.round((new Date(to) - new Date(from)) / 86400000) + 1; if (d > 0) nDays = d; }
  if (!googlePlacesEnabled()) {
    out.innerHTML = `<p class="empty-hint">Add a Google Places key (see js/routing-config.js) to auto-suggest. Until then, add stops with “+ New activity”.</p>`;
    return;
  }
  out.innerHTML = `<p class="empty-hint">🔎 Finding things to do in ${escapeHtml(city)} (~${nDays} day${nDays > 1 ? "s" : ""})…</p>`;
  const r = await googlePlacesSearch(`top things to do in ${city}`, Math.max(6, Math.min(20, nDays * 4)));
  if (r.error) {
    const msg = r.error === "no-key" ? "Add a Google Places key to search."
      : "Couldn't fetch suggestions (" + r.error + "). Check the key/restrictions, or add manually.";
    out.innerHTML = `<p class="empty-hint">${msg}</p>`;
    return;
  }
  if (!r.places.length) { out.innerHTML = `<p class="empty-hint">No results — try a broader city name.</p>`; return; }
  _cvPlaces = r.places;
  const preCheck = nDays * 3;
  out.innerHTML = `
    <p class="empty-hint">Pick the ones you like — they go to Suggestions to vote on and drag onto days.</p>
    <div class="cv-list">${r.places.map((p, i) => `
      <label class="cv-item">
        <input type="checkbox" data-i="${i}" ${i < preCheck ? "checked" : ""} />
        <div class="cv-thumb ${p.photo ? "has-photo" : ""}" ${p.photo ? `style="background-image:url('${p.photo}')"` : ""}></div>
        <div class="cv-main">
          <div class="cv-name">${escapeHtml(p.name)}${p.rating ? ` <span class="cv-rating">★ ${p.rating}</span>` : ""}</div>
          <div class="cv-sub">${escapeHtml(p.summary || p.types.slice(0, 2).join(", ") || p.address)}</div>
        </div>
      </label>`).join("")}</div>
    <div class="modal-actions"><button class="primary" id="cv-add">Add selected to Suggestions</button></div>`;
  document.getElementById("cv-add").addEventListener("click", () => {
    let n = 0;
    document.querySelectorAll(".cv-item input:checked").forEach((ch) => {
      const p = _cvPlaces[Number(ch.dataset.i)];
      if (!p) return;
      addSuggestion({
        id: uid(),
        title: p.name,
        location: { name: p.name, lat: p.lat, lng: p.lng, label: p.address, photo: p.photo || "" },
        notes: [p.summary, p.rating ? `★ ${p.rating} (${p.ratingCount})` : "", "From City visit: " + city].filter(Boolean).join(" · "),
        by: getMe() || "Someone",
        votes: 0, voters: [], accepted: false,
      });
      n++;
    });
    closeModal();
    toast(`Added ${n} idea${n !== 1 ? "s" : ""} to Suggestions`);
  });
}

function renderAddSubRow(parent) {
  const li = el(`
    <li class="ck-row ck-sub ck-addsub">
      <input class="ck-sub-input" placeholder="Add subtask…" />
      <button class="ck-sub-save primary">Add</button>
    </li>
  `);
  const input = li.querySelector(".ck-sub-input");
  const save = () => {
    const v = input.value.trim();
    if (!v) return;
    addCheck(v, "", { section: parent.section || "", parentId: parent.id });
    // addCheck re-renders; _addingSubFor stays set so the input reappears for the next one
  };
  li.querySelector(".ck-sub-save").addEventListener("click", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") { _addingSubFor = null; renderChecklist(); }
  });
  setTimeout(() => input.focus(), 0);
  return li;
}

function renderHeader() {
  const disp = document.getElementById("trip-name-display");
  if (disp) disp.textContent = trip.name || "Name your trip…";

  // Keep the (open) settings fields in sync without clobbering active typing.
  const set = (id, val) => {
    const node = document.getElementById(id);
    if (node && document.activeElement !== node) node.value = val || "";
  };
  set("s-name", trip.name);
  set("s-start", trip.start);
  set("s-end", trip.end);

  const me = getMe();
  const meEl = document.getElementById("me-name");
  if (meEl) meEl.innerHTML = me ? avatar(me, true) : "—";
}

/* ============================================================
   Trip settings — consolidated name, dates, people, share/sync
   ============================================================ */
function tripSettings() {
  const live = typeof syncEnabled === "function" && syncEnabled();
  const me = getMe();
  const roster = trip.collaborators.length
    ? trip.collaborators.map((n) => avatar(n, true)).join(" ")
    : `<span class="empty-hint">No one yet</span>`;

  openModal(`
    <h2>⚙ Trip settings</h2>
    <div class="form-row">
      <label>Trip name</label>
      <input id="s-name" value="${escapeHtml(trip.name || "")}" placeholder="Name your trip…" />
    </div>
    <div class="form-grid">
      <div class="form-row"><label>From</label><input id="s-start" type="date" value="${trip.start || ""}" /></div>
      <div class="form-row"><label>To</label><input id="s-end" type="date" value="${trip.end || ""}" /></div>
    </div>
    <div class="form-row">
      <label>Trip link <span class="lbl-soft">— optional URL</span></label>
      <input id="s-link" type="url" inputmode="url" value="${escapeHtml(trip.link || "")}" placeholder="https://… (shared doc, booking, itinerary)" />
    </div>
    <div class="form-row">
      <label>Who's planning</label>
      <div class="settings-roster">${roster}</div>
      <div class="settings-me">You: ${me ? avatar(me, true) : "—"} <button class="link" id="s-identity">change</button></div>
    </div>
    <div class="form-row">
      <label>Share &amp; backup</label>
      <div class="settings-actions">
        <button type="button" class="ghost" id="s-share">🔗 Share link</button>
        <button type="button" class="ghost" id="s-export">⬇ Export</button>
        <button type="button" class="ghost" id="s-import">⬆ Import</button>
      </div>
      <div class="geo-result ${live ? "ok" : ""}">${
        live
          ? "🟢 Live sync is on — changes appear for everyone instantly."
          : "Saved on this device. Use Share or Export to sync with others."
      }</div>
    </div>
    <div class="modal-actions">
      <button type="button" class="ghost" id="s-lock">🔒 Lock app</button>
      <button type="button" class="primary" id="modal-done">Done</button>
    </div>
  `);

  const nameEl = document.getElementById("s-name");
  nameEl.addEventListener("input", () => {
    trip.name = nameEl.value; saveTrip(); syncMeta({ name: trip.name });
    const disp = document.getElementById("trip-name-display");
    if (disp) disp.textContent = trip.name || "Name your trip…";
  });
  document.getElementById("s-start").addEventListener("change", (e) => {
    trip.start = e.target.value; saveTrip(); syncMeta({ start: trip.start });
  });
  document.getElementById("s-end").addEventListener("change", (e) => {
    trip.end = e.target.value; saveTrip(); syncMeta({ end: trip.end });
  });
  const linkEl = document.getElementById("s-link");
  linkEl.addEventListener("change", () => {
    trip.link = normUrl(linkEl.value.trim()); linkEl.value = trip.link;
    saveTrip(); syncMeta({ link: trip.link }); refreshOverviewIfActive();
  });
  document.getElementById("s-identity").addEventListener("click", () => identityPicker());
  document.getElementById("s-share").addEventListener("click", () => shareModal());
  document.getElementById("s-export").addEventListener("click", () => exportTrip());
  document.getElementById("s-import").addEventListener("click", () => document.getElementById("file-input").click());
  document.getElementById("s-lock").addEventListener("click", () => lockApp());
  document.getElementById("modal-done").addEventListener("click", () => closeModal());
}

function tabIsActive(name) {
  const t = document.querySelector(`.tab[data-tab="${name}"]`);
  return t && t.classList.contains("active");
}

/** Switch tabs (used by tab clicks and "view all" links in the overview). */
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === name)
  );
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  const panel = document.getElementById("tab-" + name);
  if (panel) panel.classList.add("active");
  if (name === "map") refreshMap();
  if (name === "overview") renderOverview();
}

function renderAll() {
  renderHeader();
  renderTimeline();
  renderSuggestions();
  renderChecklist();
  if (tabIsActive("overview")) renderOverview();
  if (tabIsActive("map")) refreshMap();
}

/* ============================================================
   Overview — the "home" dashboard tying everything together
   ============================================================ */
let _overviewDay = null; // selected day: a date string, "all", or "unscheduled"
let _timelineMode = localStorage.getItem("pointrak.timelineMode") || "all"; // "all" or "day"
let _timelineDay = localStorage.getItem("pointrak.timelineDay") || null; // day when in day mode

function saveTimelineView() {
  try {
    localStorage.setItem("pointrak.timelineMode", _timelineMode);
    localStorage.setItem("pointrak.timelineDay", _timelineDay || "");
  } catch (_) {}
}

/** Distinct, sorted day list combining the trip's date range and item dates. */
function overviewDayList() {
  const set = new Set();
  if (trip.start) {
    const s = new Date(trip.start + "T00:00:00");
    const e = new Date((trip.end || trip.start) + "T00:00:00");
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      set.add(d.toISOString().slice(0, 10));
    }
  }
  for (const it of trip.items) if (it.date) set.add(it.date);
  return Array.from(set).sort();
}

function dayLabel(day, dayList) {
  if (day === "all") return "All days";
  if (day === "unscheduled") return "Unscheduled";
  const idx = dayList.indexOf(day);
  return (idx >= 0 ? `Day ${idx + 1} · ` : "") + prettyDate(day);
}

/** Tripsy-style horizontal day strip: weekday + date number + event dots. */
function dayStripHtml(selected, opts = {}) {
  const days = overviewDayList();
  const todayKey = new Date().toISOString().slice(0, 10);
  let html = "";
  if (opts.all) {
    html += `<button class="day-chip day-pill ${selected === "all" ? "active" : ""}" data-day="all"><span class="dc-pill">All</span></button>`;
  }
  html += days
    .map((d) => {
      const dt = new Date(d + "T00:00:00");
      const wd = dt.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3).toUpperCase();
      const n = trip.items.filter((it) => it.date === d).length;
      const dots = n
        ? `<span class="dc-dots">${"•".repeat(Math.min(n, 3))}</span>`
        : `<span class="dc-dots dc-none">·</span>`;
      return `<button class="day-chip daycal ${selected === d ? "active" : ""} ${d === todayKey ? "is-today" : ""}" data-day="${d}">
        <span class="dc-wd">${wd}</span><span class="dc-num">${dt.getDate()}</span>${dots}
      </button>`;
    })
    .join("");
  if (opts.unscheduled) {
    html += `<button class="day-chip day-pill ${selected === "unscheduled" ? "active" : ""}" data-day="unscheduled"><span class="dc-pill">Unsched.</span></button>`;
  }
  return html;
}

function renderOverview() {
  const wrap = document.getElementById("overview");
  if (!wrap) return;

  const items = orderedItems();
  const _nextId = nextUpItemId();
  const nextUp = _nextId ? items.find((x) => x.id === _nextId) : null;
  const pendingSugg = trip.suggestions.filter((s) => !s.accepted);
  const topSugg = [...pendingSugg].sort((a, b) => (b.votes || 0) - (a.votes || 0)).slice(0, 4);

  const doneCount = trip.checklist.filter((c) => c.done).length;
  const totalCount = trip.checklist.length;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const openChecks = trip.checklist.filter((c) => !c.done).slice(0, 5);

  const located = items.filter((it) => it.location && typeof it.location.lat === "number");

  // ----- day selection -----
  const dayList = overviewDayList();
  const hasUnscheduled = items.some((it) => !it.date);
  const validDay =
    _overviewDay === "all" ||
    (_overviewDay === "unscheduled" && hasUnscheduled) ||
    dayList.includes(_overviewDay);
  if (!validDay) {
    const today = new Date().toISOString().slice(0, 10);
    _overviewDay = dayList.includes(today)
      ? today
      : dayList[0] || (hasUnscheduled ? "unscheduled" : "all");
  }
  const dayItems =
    _overviewDay === "all"
      ? items
      : _overviewDay === "unscheduled"
      ? items.filter((it) => !it.date)
      : items.filter((it) => it.date === _overviewDay);

  // ----- Hero -----
  const countdown = tripCountdown();
  const tripLen = tripLengthDays();
  const datesLine = tripDateRange() + (tripLen ? ` · ${tripLen}-day trip` : "");
  const crew = (trip.collaborators.length ? trip.collaborators : USERS)
    .map((n) => avatar(n, true))
    .join("");
  const hero = `
    <div class="ov-card ov-hero">
      <div class="ov-hero-top">
        <div>
          <div class="ov-hero-title">${escapeHtml(trip.name || "Your trip")}</div>
          <div class="ov-hero-dates">${escapeHtml(datesLine)}</div>
          ${trip.link ? `<div class="ov-hero-link">${linkChip(trip.link)}</div>` : ""}
        </div>
        ${countdown ? `<div class="ov-countdown">${countdown}</div>` : ""}
      </div>
      <div class="ov-quick">
        <button type="button" class="ov-qbtn" data-q="add"><span class="ov-qcirc">${icon("plus")}</span><span class="ov-qlbl">New</span></button>
        <button type="button" class="ov-qpill" data-q="city"><span class="ov-qpill-ico">${icon("city")}</span> Explore city</button>
      </div>
      ${
        nextUp
          ? `<div class="ov-nextup"><span class="ov-nextup-ic">${itemIcon(nextUp)}</span> <strong>Next up</strong> · ${escapeHtml(nextUp.title)}${
              nextUp.date ? ` · ${shortDate(nextUp.date)}${nextUp.time ? " " + escapeHtml(nextUp.time) : ""}` : ""
            }</div>`
          : ""
      }
      <div class="ov-stats">
        <div class="ov-stat"><span class="num">${items.length}</span><span class="lbl">itinerary items</span></div>
        <div class="ov-stat"><span class="num">${pendingSugg.length}</span><span class="lbl">open suggestions</span></div>
        <div class="ov-stat"><span class="num">${doneCount}/${totalCount}</span><span class="lbl">to-dos done</span></div>
        <div class="ov-stat"><span class="num">${located.length}</span><span class="lbl">stops mapped</span></div>
      </div>
      <div class="ov-crew">Planning together: <span class="ov-crew-list">${crew}</span></div>
    </div>`;

  // ----- Day selector tile -----
  const dayChips = dayStripHtml(_overviewDay, { all: true, unscheduled: hasUnscheduled });
  const daySelector = `
    <div class="ov-card ov-dayselect">
      <div class="ov-card-head"><h3>${icon("calendar")} Days</h3></div>
      <div class="day-chips">${dayChips}</div>
    </div>`;

  // ----- Day view tile (the big left panel) -----
  const idx = dayList.indexOf(_overviewDay);
  const prevDisabled = idx <= 0 ? "disabled" : "";
  const nextDisabled = idx < 0 || idx >= dayList.length - 1 ? "disabled" : "";
  let dayBody = "";
  const nextId = nextUpItemId();
  if (!dayItems.length) {
    dayBody = `<p class="empty-hint">Free day — nothing planned. <button class="link ov-add" data-add="item">Add something →</button></p>`;
  } else {
    dayItems.forEach((it, i) => {
      const chips = timeChips(it, { short: true });
      if (it.type === "travel" && it.legMode !== "flight" && it.location?.lat != null) {
        const prevSameDay = i > 0 ? dayItems[i - 1] : null;
        if (!(prevSameDay && legBetween(prevSameDay, it))) {
          const origin = prevLocatedItem(items, it.id);
          if (origin) chips.push(durChip(origin.id, it.id, it.legMode || "car"));
        }
      }
      if (it.location?.name) chips.push(locChip(it.location));
      if (it.link) chips.push(linkChip(it.link, { short: true }));
      if (it.by) chips.push(`<span class="chip chip-author">${avatar(it.by, false)}</span>`);
      const past = isPastItem(it);
      const isNext = it.id === nextId;
      dayBody += `
        <div class="dv-item ${it.done ? "dv-done" : ""} ${past ? "dv-past" : ""} ${isNext ? "dv-next" : ""}" data-type="${it.type}" data-edit="${it.id}">
          <span class="dv-ico">${itemIcon(it)}</span>
          <div class="dv-main">
            <div class="dv-title">${isNext ? '<span class="next-tag">Next up</span> ' : ""}${escapeHtml(it.title)}</div>
            <div class="dv-meta">${chips.join("")}</div>
          </div>
          ${thumbHtml(it, "dv-thumb")}
        </div>`;
      const next = dayItems[i + 1];
      if (legBetween(it, next)) {
        dayBody += `<div class="ov-leg leg-slot" data-leg-from="${it.id}" data-leg-to="${next.id}"></div>`;
      }
    });
  }
  const dayView = `
    <div class="ov-card ov-dayview">
      <div class="ov-card-head">
        <div class="dv-nav">
          <button class="dv-arrow" data-step="-1" ${prevDisabled}>${icon("chevronLeft")}</button>
          <h3>${escapeHtml(dayLabel(_overviewDay, dayList))}</h3>
          <button class="dv-arrow" data-step="1" ${nextDisabled}>${icon("chevronRight")}</button>
        </div>
        <div class="ov-head-actions"><button class="ov-add" data-add="item">+ Add</button><button class="link ov-go" data-go="timeline">Full timeline →</button></div>
      </div>
      <div class="dv-body">${dayBody}</div>
    </div>`;

  // ----- Top suggestions (right) -----
  const suggHtml = `
    <div class="ov-card">
      <div class="ov-card-head"><h3>${icon("sparkles")} Top suggestions</h3><div class="ov-head-actions"><button class="ov-add" data-add="suggestion">+ Add</button><button class="link ov-go" data-go="suggestions">View all →</button></div></div>
      ${
        topSugg.length
          ? `<ul class="ov-list">${topSugg
              .map(
                (s) => `<li class="ov-li ov-sugg" draggable="true" data-sugg="${s.id}" title="Drag onto a day — or tap ＋ to pick a day">
                  <span class="ov-grip">⠿</span>
                  <span class="ov-vote">👍 ${s.votes || 0}</span>
                  <span class="ov-li-main">
                    <span class="ov-li-title">${escapeHtml(s.title)}</span>
                    <span class="ov-li-sub">by ${escapeHtml(s.by || "someone")}${s.location?.name ? " · " + locInline(s.location) : ""}</span>
                  </span>
                  <button class="ov-sugg-add" data-sugg-add="${s.id}" title="Add to a day">＋</button>
                </li>`
              )
              .join("")}</ul>
             <p class="ov-drag-hint">Tip: drag a suggestion onto a day (or a day chip) to add it to the plan.</p>`
          : `<p class="empty-hint">No suggestions yet. <button class="link ov-add" data-add="suggestion">Suggest something →</button></p>`
      }
    </div>`;

  // ----- Checklist (right) -----
  // ----- Checklist (right) — collapsible sections -----
  const ckAll = trip.checklist;
  const ckTop = ckAll.filter((c) => !c.parentId);
  const ckKids = (id) => ckAll.filter((c) => c.parentId === id);
  const ckSecOrder = [];
  for (const c of ckTop) { const s = c.section || ""; if (!ckSecOrder.includes(s)) ckSecOrder.push(s); }
  let checkBody;
  if (!totalCount) {
    checkBody = `<p class="empty-hint">No to-dos yet.</p>`;
  } else {
    checkBody = ckSecOrder.map((section) => {
      const inSec = ckTop.filter((c) => (c.section || "") === section);
      let t = 0, d = 0; const open = [];
      for (const it of inSec) {
        t++; if (it.done) d++; else open.push(it);
        for (const sub of ckKids(it.id)) { t++; if (sub.done) d++; else open.push(sub); }
      }
      const collapsed = isSectionCollapsed(section);
      const rows = collapsed
        ? ""
        : open.length
        ? `<ul class="ov-list">${open.slice(0, 8).map((c) => `<li class="ov-li"><button type="button" class="ov-ck" data-ck="${c.id}" title="Mark done" aria-label="Mark done">${icon("circle")}</button><span class="ov-li-main"><span class="ov-li-title">${escapeHtml(c.text)}</span></span>${c.assignee ? avatar(c.assignee, false) : ""}</li>`).join("")}</ul>`
        : `<p class="empty-hint" style="margin:4px 0 0">All done 🎉</p>`;
      return `<div class="ov-sec ${collapsed ? "collapsed" : ""}">
        <button type="button" class="ov-sec-head" data-sec="${escapeHtml(section)}">
          <span class="ck-chevron">▾</span><span class="ov-sec-title">${escapeHtml(section || "General")}</span><span class="ov-sec-count">${d}/${t}</span>
        </button>${rows}
      </div>`;
    }).join("");
  }
  const checkHtml = `
    <div class="ov-card">
      <div class="ov-card-head"><h3>${icon("list")} Checklist</h3><div class="ov-head-actions"><button class="ov-add" data-add="check">+ Add</button><button class="link ov-go" data-go="checklist">View all →</button></div></div>
      <div class="ov-progress"><div class="ov-progress-bar" style="width:${pct}%"></div></div>
      <div class="ov-progress-lbl">${doneCount} of ${totalCount} done (${pct}%)</div>
      ${checkBody}
    </div>`;

  // ----- Mini map (right) -----
  const mapHtml = `
    <div class="ov-card ov-map-card">
      <div class="ov-card-head"><h3>${icon("map")} Route</h3><button class="link ov-go" data-go="map">Open full map →</button></div>
      <div id="map-overview"></div>
    </div>`;

  // On wide screens, emulate the desktop app: full map backdrop + floating
  // rail of rounded cards. Otherwise use the stacked two-column layout.
  const mapMode = window.matchMedia("(min-width: 920px)").matches;
  if (mapMode) {
    wrap.classList.add("ov-mapmode");
    wrap.innerHTML =
      `<div class="ov-rail">${hero}${daySelector}${dayView}${suggHtml}${checkHtml}</div>` +
      `<div class="ov-mapbg"><div id="map-overview"></div></div>`;
  } else {
    wrap.classList.remove("ov-mapmode");
    wrap.innerHTML =
      hero +
      `<div class="ov-col-left">${daySelector}${dayView}</div>` +
      `<div class="ov-col-right">${suggHtml}${checkHtml}${mapHtml}</div>`;
  }

  // day-default for the "+ Add" buttons in the day view
  const addDefaults = () =>
    _overviewDay && _overviewDay !== "all" && _overviewDay !== "unscheduled"
      ? { date: _overviewDay }
      : undefined;

  wrap.querySelectorAll(".ov-go").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.go))
  );
  wrap.querySelectorAll(".ov-qbtn, .ov-qpill").forEach((b) =>
    b.addEventListener("click", () => {
      const q = b.dataset.q;
      if (q === "add") itemEditor(null, addDefaults());
      else if (q === "city") cityVisitModal();
    })
  );
  wrap.querySelectorAll(".ov-add").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.add === "item") itemEditor(null, addDefaults());
      else if (b.dataset.add === "suggestion") suggestionEditor();
      else if (b.dataset.add === "check") checklistEditor();
    })
  );
  wrap.querySelectorAll(".ov-sugg-add").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      suggestionDayPicker(b.dataset.suggAdd);
    })
  );
  wrap.querySelectorAll(".ov-ck").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCheck(b.dataset.ck); // saves, syncs, and re-renders (incl. overview)
    })
  );
  wrap.querySelectorAll(".ov-sec-head").forEach((b) =>
    b.addEventListener("click", () => { toggleSectionCollapsed(b.dataset.sec); renderOverview(); })
  );
  wrap.querySelectorAll(".day-chip").forEach((b) =>
    b.addEventListener("click", () => {
      _overviewDay = b.dataset.day;
      renderOverview();
    })
  );
  wrap.querySelectorAll(".dv-arrow").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.hasAttribute("disabled")) return;
      const cur = dayList.indexOf(_overviewDay);
      const target = cur + Number(b.dataset.step);
      if (target >= 0 && target < dayList.length) {
        _overviewDay = dayList[target];
        renderOverview();
      }
    })
  );
  wrap.querySelectorAll(".dv-item").forEach((row) =>
    row.addEventListener("click", () => {
      const it = trip.items.find((x) => x.id === row.dataset.edit);
      if (it) itemEditor(it);
    })
  );

  wireSuggestionDrag(wrap);
  annotateLegSlots("overview", wrap.querySelector(".dv-body"), dayItems);
  annotateDurChips("overview-dur", wrap.querySelector(".dv-body"), items);
  loadThumbs(wrap);
  refreshOverviewMap();
}

/**
 * Drag a suggestion (from the Top suggestions tile) onto the day view or a
 * day chip to accept it as an event on that day.
 */
function wireSuggestionDrag(wrap) {
  const dayToDate = (key) =>
    key && key !== "all" && key !== "unscheduled" ? key : "";

  wrap.querySelectorAll("[data-sugg]").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", el.dataset.sugg);
      e.dataTransfer.effectAllowed = "copy";
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));
  });

  const setupDrop = (node, getDate) => {
    if (!node) return;
    node.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes("text/plain")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      node.classList.add("drag-over");
    });
    node.addEventListener("dragleave", () => node.classList.remove("drag-over"));
    node.addEventListener("drop", (e) => {
      e.preventDefault();
      node.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      if (!id) return;
      const date = getDate();
      if (date) _overviewDay = date; // jump to the day we dropped on
      acceptSuggestion(id, date);
    });
  };

  setupDrop(wrap.querySelector(".ov-dayview"), () => dayToDate(_overviewDay));
  wrap.querySelectorAll(".day-chip").forEach((chip) =>
    setupDrop(chip, () => dayToDate(chip.dataset.day))
  );
}

/** Quick "add a to-do" modal (used from the Overview tile). */
function checklistEditor() {
  const existing = [];
  for (const c of trip.checklist) {
    const s = (c.section || "").trim();
    if (s && !existing.includes(s)) existing.push(s);
  }
  openModal(`
    <h2>Add a to-do</h2>
    <form id="check-form">
      <div class="form-row">
        <label>Task</label>
        <input id="c-text" required placeholder="e.g. Book travel insurance" />
      </div>
      <div class="form-grid">
        <div class="form-row">
          <label>Section (optional)</label>
          <input id="c-section" list="sections-list" placeholder="e.g. Before the trip" />
        </div>
        <div class="form-row">
          <label>Assignee (optional)</label>
          <input id="c-assignee" list="people-list" placeholder="Peter / Niszki / JS" />
        </div>
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit">Add to-do</button>
      </div>
    </form>
  `);
  document.getElementById("check-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = document.getElementById("c-text").value.trim();
    if (!text) return;
    addCheck(text, document.getElementById("c-assignee").value.trim(), {
      section: document.getElementById("c-section").value.trim(),
    });
    closeModal();
  });
}

/** Re-render the Overview dashboard when it's the visible tab. */
function refreshOverviewIfActive() {
  if (tabIsActive("overview")) renderOverview();
}

function tripDateRange() {
  if (trip.start && trip.end) return prettyDate(trip.start) + " → " + prettyDate(trip.end);
  if (trip.start) return "from " + prettyDate(trip.start);
  return "Dates not set yet";
}

/** Trip length in days (inclusive), or 0 if dates aren't both set. */
function tripLengthDays() {
  if (!trip.start || !trip.end) return 0;
  const s = new Date(trip.start + "T00:00:00");
  const e = new Date(trip.end + "T00:00:00");
  const n = Math.round((e - s) / 86400000) + 1;
  return n > 0 ? n : 0;
}

function tripCountdown() {
  if (!trip.start) return "";
  const start = new Date(trip.start + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((start - now) / 86400000);
  if (isNaN(days)) return "";
  if (days > 1) return `Starts in ${days} days`;
  if (days === 1) return "Starts tomorrow";
  if (days === 0) return "Starts today! 🎉";
  // during/after trip
  if (trip.end) {
    const end = new Date(trip.end + "T00:00:00");
    if (now <= end) return "On the trip ✈️";
  }
  return "Trip complete";
}
