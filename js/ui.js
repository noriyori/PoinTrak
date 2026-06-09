/* ============================================================
   ui.js — rendering, modals, helpers
   ============================================================ */

const ITEM_TYPES = {
  hotel:  { icon: "🏨", label: "Hotel stay" },
  event:  { icon: "🎟️", label: "Event / activity" },
  travel: { icon: "🚗", label: "Travel / transport" },
  task:   { icon: "✔️", label: "Task / errand" },
};

/** Departure time for an item: manual departTime if set, else arrival + stay. */
function departOf(it) {
  if (it.departTime) return it.departTime;
  if (it.time && it.stay) return shiftTime(it.time, it.stay).time;
  return null;
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
  if (it.type === "travel") {
    const m = TRAVEL_MODES[it.legMode || "car"];
    if (m) return m.icon;
  }
  return (ITEM_TYPES[it.type] || ITEM_TYPES.event).icon;
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
function timeChips(it, opts = {}) {
  const s = opts.short;
  const overnight = it.arriveDate && it.arriveDate !== it.date;
  const dep = departOf(it);

  const arriveChip = it.time
    ? `<span class="chip">🛬 ${s ? "" : "Arrive "}${overnight ? shortDate(it.arriveDate) + " " : ""}${escapeHtml(it.time)}</span>`
    : "";
  const departChip = dep
    ? `<span class="chip">🛫 ${s ? "" : "Depart "}${overnight && it.date ? shortDate(it.date) + " " : ""}${escapeHtml(dep)}${!s && !it.departTime ? " (auto)" : ""}</span>`
    : "";
  const stayChip = it.stay ? `<span class="chip">⏳ ${s ? "" : "Stay "}${escapeHtml(humanDuration(it.stay))}</span>` : "";
  const segs = it.legMode === "flight" ? flightSegments(it) : [];
  const flightChip = segs.length
    ? `<span class="chip">✈️ ${escapeHtml(
        segs.map((g) => [g.no, [g.from, g.to].filter(Boolean).join("→")].filter(Boolean).join(" ")).join(", ")
      )}</span>`
    : "";
  const tzChip = it.tz ? `<span class="chip chip-tz" title="Local time zone">🕓 ${escapeHtml(it.tz)}</span>` : "";
  const seatBits = [it.resv ? "🎫 " + it.resv : "", it.seat ? "💺 " + it.seat : "", it.cost ? "💰 " + it.cost : ""].filter(Boolean);
  const seatChip = seatBits.length ? `<span class="chip">${escapeHtml(seatBits.join(" · "))}</span>` : "";

  // Flights/overnight travel read depart→arrive; everything else arrive→stay→depart.
  const order = overnight ? [departChip, arriveChip, tzChip, flightChip, seatChip] : [arriveChip, stayChip, departChip, tzChip, flightChip, seatChip];
  return order.filter(Boolean);
}

/** Timeline items sorted by date then time, undated last. */
/** Time used to place an item on its date: departure time for overnight
 *  travel (which departs this date but arrives later), else arrival time. */
function sortTimeOf(it) {
  if (it.departTime && it.arriveDate && it.arriveDate !== it.date) return it.departTime;
  return it.time || it.departTime || "99:99";
}

function orderedItems() {
  return [...trip.items].sort((a, b) => {
    const ka = (a.date || "9999") + sortTimeOf(a);
    const kb = (b.date || "9999") + sortTimeOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/* ---------- "Now" anchor: past vs upcoming ---------- */
function itemStartDate(it) {
  if (!it.date) return null;
  const t = (it.departTime || it.time || "00:00").slice(0, 5);
  const d = new Date(it.date + "T" + t + ":00");
  return isNaN(d) ? null : d;
}
function itemEndDate(it) {
  const d = it.arriveDate || it.date;
  if (!d) return null;
  const t = (it.time || it.departTime || "23:59").slice(0, 5);
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
  const icon =
    collection === "items" ? itemIcon(entity) : "💡";

  openModal(`
    <h2>${icon} ${escapeHtml(entity.title)}</h2>
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
  const typeButtons = Object.entries(ITEM_TYPES)
    .map(
      ([key, meta]) => `
      <button type="button" class="type-opt ${it.type === key ? "sel" : ""}" data-type="${key}">
        <span class="ico">${meta.icon}</span>${meta.label}
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
      <div class="form-grid">
        <div class="form-row">
          <label>Date</label>
          <input id="f-date" type="date" value="${it.date || ""}" />
        </div>
        <div class="form-row" id="dep-time-cell" ${it.type === "hotel" ? "hidden" : ""}>
          <label>Departure time</label>
          <input id="f-depart" type="time" value="${it.departTime || ""}" />
          <div class="geo-result">Leave blank to auto-calculate</div>
        </div>
      </div>
      <div class="form-grid">
        <div class="form-row" id="arr-date-cell" ${it.type === "hotel" ? "hidden" : ""}>
          <label>Arrival date <span class="lbl-soft">— if a later day</span></label>
          <input id="f-arrdate" type="date" value="${it.arriveDate || ""}" />
        </div>
        <div class="form-row">
          <label>Arrival time</label>
          <input id="f-time" type="time" value="${it.time || ""}" />
        </div>
      </div>
      <div class="form-row" id="stay-row" ${it.type === "hotel" ? "hidden" : ""}>
        <label>Stay duration</label>
        <select id="f-stay">${stayOptions(it.stay || 0)}</select>
      </div>
      <div class="form-row" id="enddate-row" ${it.type === "hotel" ? "" : "hidden"}>
        <label>Check-out date</label>
        <input id="f-enddate" type="date" value="${it.endDate || ""}" />
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

  // type picker
  document.querySelectorAll(".type-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".type-opt").forEach((b) => b.classList.remove("sel"));
      btn.classList.add("sel");
      chosenType = btn.dataset.type;
      const hotel = chosenType === "hotel";
      document.getElementById("enddate-row").hidden = !hotel;
      document.getElementById("stay-row").hidden = hotel;
      document.getElementById("dep-time-cell").hidden = hotel;
      document.getElementById("arr-date-cell").hidden = hotel;
    });
  });

  // show flight detail fields only when the mode is Flight
  document.getElementById("f-mode").addEventListener("change", (e) => {
    document.getElementById("flight-row").hidden = e.target.value !== "flight";
  });

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
    const data = {
      id: it.id || uid(),
      type: chosenType,
      title: document.getElementById("f-title").value.trim(),
      date: document.getElementById("f-date").value,
      time: document.getElementById("f-time").value,
      stay: parseInt(document.getElementById("f-stay").value, 10) || 0,
      departTime: document.getElementById("f-depart").value,
      arriveDate: document.getElementById("f-arrdate").value,
      tz: fetchedTz,
      legMode: document.getElementById("f-mode").value,
      endDate: document.getElementById("f-enddate").value,
      notes: document.getElementById("f-notes").value.trim(),
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

    const dayItems = groups[key] || [];
    if (!dayItems.length) {
      group.appendChild(el(`<div class="day-empty">${isUns ? "Nothing here yet" : "Free day — nothing planned"}</div>`));
    }
    dayItems.forEach((it, idx) => {
      const chips = timeChips(it);
      if (it.type === "hotel" && it.endDate) chips.push(`<span class="chip">🛏 until ${prettyDate(it.endDate)}</span>`);
      if (it.location?.name) {
        const am = appleMapsUrl(it.location);
        chips.push(
          am
            ? `<a class="chip chip-link" href="${am}" target="_blank" rel="noopener" title="Open in Apple Maps">📍 ${escapeHtml(it.location.name)} ↗</a>`
            : `<span class="chip">📍 ${escapeHtml(it.location.name)}</span>`
        );
      }
      if (it.by) chips.push(`<span class="chip chip-author">added by ${avatar(it.by, true)}</span>`);

      const past = isPastItem(it);
      const isNext = it.id === nextId;
      const card = el(`
        <div class="tl-item ${it.done ? "tl-done" : ""} ${past ? "tl-past" : ""} ${isNext ? "tl-next" : ""}" data-type="${it.type}">
          <div class="tl-icon">${itemIcon(it)}</div>
          <div class="tl-main">
            <p class="tl-title">${isNext ? '<span class="next-tag">Next up</span> ' : ""}${escapeHtml(it.title)}</p>
            <div class="tl-meta">${chips.join("")}</div>
            ${it.notes ? `<p class="tl-notes">${escapeHtml(it.notes)}</p>` : ""}
          </div>
          <div class="tl-actions">
            <button data-act="comments" title="Comments">💬 ${(it.comments || []).length || ""}</button>
            <button data-act="done">${it.done ? "↺" : "✓"}</button>
            <button data-act="edit">✎</button>
          </div>
        </div>
      `);
      card.querySelector('[data-act="edit"]').addEventListener("click", () => itemEditor(it));
      card.querySelector('[data-act="done"]').addEventListener("click", () => toggleItemDone(it.id));
      card.querySelector('[data-act="comments"]').addEventListener("click", () => commentsModal("items", it.id));
      group.appendChild(card);

      // Auto travel leg to the next located stop on the same day.
      const next = dayItems[idx + 1];
      if (next && it.location?.lat != null && next.location?.lat != null) {
        group.appendChild(
          el(`<div class="tl-leg leg-slot" data-leg-from="${it.id}" data-leg-to="${next.id}"></div>`)
        );
      }
    });
    wrap.appendChild(group);
  }

  // Fill in travel legs (leave/arrive times + drive) asynchronously.
  annotateLegs(items);
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
  // A manual departure time wins; otherwise departure = arrival + stay.
  const depart = cur.departTime || (cur.time && cur.stay ? fromMin(toMin(cur.time) + cur.stay) : null);
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

  return (
    `<span class="leg-pill ${warn ? "leg-warn" : "leg-ok"}">` +
    `${m.icon} ~${drive}${dist}${via} to ${escapeHtml(next.title)}${timing}</span>`
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

    // The mode belongs to the ARRIVING event (how you get to `next`).
    const mode = next.legMode || "car";
    const m = TRAVEL_MODES[mode] || TRAVEL_MODES.car;

    // A flight is represented by its own airport-to-airport arc; show its
    // segments rather than estimating a path between the two stop pins.
    if (mode === "flight") {
      node.innerHTML = flightLegPill(next);
      continue;
    }

    node.innerHTML = `<span class="leg-pill leg-calc">${m.icon} estimating ${m.label.toLowerCase()}…</span>`;
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
  return `<span class="leg-pill leg-ok">✈️ ${escapeHtml(route || "Flight")} to ${escapeHtml(it.title)}</span>`;
}

function annotateLegs(items) {
  annotateLegSlots("timeline", document.getElementById("timeline"), items);
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
        <h3>${escapeHtml(s.title)}</h3>
        <div class="by">${avatar(s.by || "someone", true)} <span class="by-lbl">suggested</span>${s.location?.name ? " · 📍 " + escapeHtml(s.location.name) : ""}</div>
        ${s.notes ? `<div class="notes">${escapeHtml(s.notes)}</div>` : ""}
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
    card.querySelector(".vote").addEventListener("click", () => voteSuggestion(s.id));
    card.querySelector(".cmt-btn").addEventListener("click", () => commentsModal("suggestions", s.id));
    if (!s.accepted) {
      card.querySelector(".accept").addEventListener("click", () => suggestionDayPicker(s.id));
      card.querySelector(".del").addEventListener("click", () => removeSuggestion(s.id));
    }
    wrap.appendChild(card);
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
    const inSection = topLevel.filter((c) => (c.section || "") === section);
    let total = 0, done = 0;
    for (const it of inSection) {
      total++; if (it.done) done++;
      for (const sub of childrenOf(it.id)) { total++; if (sub.done) done++; }
    }
    const collapsed = isSectionCollapsed(section);
    const header = el(`
      <li class="ck-section ${collapsed ? "collapsed" : ""}">
        <span class="ck-sec-left"><span class="ck-chevron">▾</span><span class="ck-section-title">${escapeHtml(section || "General")}</span></span>
        <span class="ck-section-count">${done}/${total}</span>
      </li>
    `);
    header.addEventListener("click", () => { toggleSectionCollapsed(section); renderChecklist(); });
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
  const li = el(`
    <li class="ck-row ${isSub ? "ck-sub" : ""} ${c.done ? "done" : ""}">
      <input type="checkbox" ${c.done ? "checked" : ""} />
      <span class="ck-text">${escapeHtml(c.text)}</span>
      ${c.by ? `<span class="ck-author" title="Added by ${escapeHtml(c.by)}">${avatar(c.by, false)}</span>` : ""}
      ${c.assignee ? `<span class="ck-assignee">➜ ${avatar(c.assignee, true)}</span>` : ""}
      ${!isSub ? `<button class="ck-sub-add" title="Add subtask">➕</button>` : ""}
      <button class="ck-del" title="Delete">🗑</button>
    </li>
  `);
  li.querySelector("input").addEventListener("change", () => toggleCheck(c.id));
  li.querySelector(".ck-del").addEventListener("click", () => deleteCheck(c.id));
  const subAdd = li.querySelector(".ck-sub-add");
  if (subAdd) subAdd.addEventListener("click", () => {
    _addingSubFor = _addingSubFor === c.id ? null : c.id;
    renderChecklist();
  });
  return li;
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
        </div>
        ${countdown ? `<div class="ov-countdown">${countdown}</div>` : ""}
      </div>
      <div class="ov-quick">
        <button type="button" class="ov-qbtn" data-q="add"><span class="ov-qcirc">＋</span><span class="ov-qlbl">New</span></button>
        <button type="button" class="ov-qbtn" data-q="flight"><span class="ov-qcirc">✈️</span><span class="ov-qlbl">Flight</span></button>
        <button type="button" class="ov-qbtn" data-q="map"><span class="ov-qcirc">🗺</span><span class="ov-qlbl">Map</span></button>
        <button type="button" class="ov-qbtn" data-q="suggest"><span class="ov-qcirc">💡</span><span class="ov-qlbl">Suggest</span></button>
      </div>
      ${
        nextUp
          ? `<div class="ov-nextup">⏭ <strong>Next up</strong> · ${itemIcon(nextUp)} ${escapeHtml(nextUp.title)}${
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
      <div class="ov-card-head"><h3>📅 Days</h3></div>
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
      if (it.location?.name) chips.push(`<span class="chip">📍 ${escapeHtml(it.location.name)}</span>`);
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
        </div>`;
      const next = dayItems[i + 1];
      if (next && it.location?.lat != null && next.location?.lat != null) {
        dayBody += `<div class="ov-leg leg-slot" data-leg-from="${it.id}" data-leg-to="${next.id}"></div>`;
      }
    });
  }
  const dayView = `
    <div class="ov-card ov-dayview">
      <div class="ov-card-head">
        <div class="dv-nav">
          <button class="dv-arrow" data-step="-1" ${prevDisabled}>◀</button>
          <h3>${escapeHtml(dayLabel(_overviewDay, dayList))}</h3>
          <button class="dv-arrow" data-step="1" ${nextDisabled}>▶</button>
        </div>
        <div class="ov-head-actions"><button class="ov-add" data-add="item">+ Add</button><button class="link ov-go" data-go="timeline">Full timeline →</button></div>
      </div>
      <div class="dv-body">${dayBody}</div>
    </div>`;

  // ----- Top suggestions (right) -----
  const suggHtml = `
    <div class="ov-card">
      <div class="ov-card-head"><h3>💡 Top suggestions</h3><div class="ov-head-actions"><button class="ov-add" data-add="suggestion">+ Add</button><button class="link ov-go" data-go="suggestions">View all →</button></div></div>
      ${
        topSugg.length
          ? `<ul class="ov-list">${topSugg
              .map(
                (s) => `<li class="ov-li ov-sugg" draggable="true" data-sugg="${s.id}" title="Drag onto a day — or tap ＋ to pick a day">
                  <span class="ov-grip">⠿</span>
                  <span class="ov-vote">👍 ${s.votes || 0}</span>
                  <span class="ov-li-main">
                    <span class="ov-li-title">${escapeHtml(s.title)}</span>
                    <span class="ov-li-sub">by ${escapeHtml(s.by || "someone")}${s.location?.name ? " · 📍 " + escapeHtml(s.location.name) : ""}</span>
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
        ? `<ul class="ov-list">${open.slice(0, 8).map((c) => `<li class="ov-li"><span class="ov-ico">⬜</span><span class="ov-li-main"><span class="ov-li-title">${escapeHtml(c.text)}</span></span>${c.assignee ? avatar(c.assignee, false) : ""}</li>`).join("")}</ul>`
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
      <div class="ov-card-head"><h3>✅ Checklist</h3><div class="ov-head-actions"><button class="ov-add" data-add="check">+ Add</button><button class="link ov-go" data-go="checklist">View all →</button></div></div>
      <div class="ov-progress"><div class="ov-progress-bar" style="width:${pct}%"></div></div>
      <div class="ov-progress-lbl">${doneCount} of ${totalCount} done (${pct}%)</div>
      ${checkBody}
    </div>`;

  // ----- Mini map (right) -----
  const mapHtml = `
    <div class="ov-card ov-map-card">
      <div class="ov-card-head"><h3>🗺 Route</h3><button class="link ov-go" data-go="map">Open full map →</button></div>
      <div id="map-overview"></div>
    </div>`;

  // On wide screens, emulate the desktop app: full map backdrop + floating
  // rail of rounded cards. Otherwise use the stacked two-column layout.
  const mapMode = window.matchMedia("(min-width: 920px)").matches;
  if (mapMode) {
    wrap.classList.add("ov-mapmode");
    wrap.innerHTML =
      `<div class="ov-mapbg"><div id="map-overview"></div></div>` +
      `<div class="ov-rail">${hero}${daySelector}${dayView}${suggHtml}${checkHtml}</div>`;
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
  wrap.querySelectorAll(".ov-qbtn").forEach((b) =>
    b.addEventListener("click", () => {
      const q = b.dataset.q;
      if (q === "add") itemEditor(null, addDefaults());
      else if (q === "flight") itemEditor(null, { ...(addDefaults() || {}), type: "travel", legMode: "flight" });
      else if (q === "map") switchTab("map");
      else if (q === "suggest") suggestionEditor();
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
