/* ============================================================
   ui.js — rendering, modals, helpers
   ============================================================ */

const ITEM_TYPES = {
  hotel:  { icon: "🏨", label: "Hotel stay" },
  event:  { icon: "🎟️", label: "Event / activity" },
  travel: { icon: "🚗", label: "Travel / transport" },
  task:   { icon: "✔️", label: "Task / errand" },
};

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

/** Timeline items sorted by date then time, undated last. */
function orderedItems() {
  return [...trip.items].sort((a, b) => {
    const ka = (a.date || "9999") + (a.time || "99:99");
    const kb = (b.date || "9999") + (b.time || "99:99");
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
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
    collection === "items" ? ITEM_TYPES[entity.type]?.icon || "🎟️" : "💡";

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
function itemEditor(existing) {
  const it = existing || { type: "event" };
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
      <div class="form-grid">
        <div class="form-row">
          <label>Date</label>
          <input id="f-date" type="date" value="${it.date || ""}" />
        </div>
        <div class="form-row">
          <label>Time</label>
          <input id="f-time" type="time" value="${it.time || ""}" />
        </div>
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

  // type picker
  document.querySelectorAll(".type-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".type-opt").forEach((b) => b.classList.remove("sel"));
      btn.classList.add("sel");
      chosenType = btn.dataset.type;
      document.getElementById("enddate-row").hidden = chosenType !== "hotel";
    });
  });

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

  document.getElementById("item-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
      id: it.id || uid(),
      type: chosenType,
      title: document.getElementById("f-title").value.trim(),
      date: document.getElementById("f-date").value,
      time: document.getElementById("f-time").value,
      endDate: document.getElementById("f-enddate").value,
      notes: document.getElementById("f-notes").value.trim(),
      location: resolvedLoc,
      done: it.done || false,
      by: it.by || getMe(),
    };
    if (!data.title) return;
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

  document.getElementById("sugg-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("s-title").value.trim();
    if (!title) return;
    const locName = document.getElementById("s-loc").value.trim();
    let location = null;
    if (locName) {
      const hit = await geocode(locName);
      location = hit ? { name: locName, lat: hit.lat, lng: hit.lng, label: hit.label } : { name: locName };
    }
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

/* ============================================================
   Renderers
   ============================================================ */
function renderTimeline() {
  const wrap = document.getElementById("timeline");
  const empty = document.getElementById("timeline-empty");
  const items = orderedItems();
  wrap.innerHTML = "";
  empty.hidden = items.length > 0;

  // group by date
  const groups = {};
  for (const it of items) {
    const key = it.date || "Unscheduled";
    (groups[key] = groups[key] || []).push(it);
  }

  for (const key of Object.keys(groups)) {
    const header =
      key === "Unscheduled"
        ? `<div class="day-title">Unscheduled</div>`
        : `<div class="day-title">${prettyDate(key)}</div>`;
    const group = el(`<div class="day-group"><div class="day-header">${header}</div></div>`);

    for (const it of groups[key]) {
      const meta = ITEM_TYPES[it.type] || ITEM_TYPES.event;
      const chips = [];
      if (it.time) chips.push(`<span class="chip">⏰ ${escapeHtml(it.time)}</span>`);
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

      const card = el(`
        <div class="tl-item ${it.done ? "tl-done" : ""}" data-type="${it.type}">
          <div class="tl-icon">${meta.icon}</div>
          <div class="tl-main">
            <p class="tl-title">${escapeHtml(it.title)}</p>
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
    }
    wrap.appendChild(group);
  }
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
            : '<button class="mini accept">Add to timeline</button><button class="mini del">Remove</button>'}
        </div>
      </div>
    `);
    card.querySelector(".vote").addEventListener("click", () => voteSuggestion(s.id));
    card.querySelector(".cmt-btn").addEventListener("click", () => commentsModal("suggestions", s.id));
    if (!s.accepted) {
      card.querySelector(".accept").addEventListener("click", () => acceptSuggestion(s.id));
      card.querySelector(".del").addEventListener("click", () => removeSuggestion(s.id));
    }
    wrap.appendChild(card);
  }
}

function renderChecklist() {
  const ul = document.getElementById("checklist");
  ul.innerHTML = "";
  for (const c of trip.checklist) {
    const li = el(`
      <li class="${c.done ? "done" : ""}">
        <input type="checkbox" ${c.done ? "checked" : ""} />
        <span class="ck-text">${escapeHtml(c.text)}</span>
        ${c.by ? `<span class="ck-author" title="Added by ${escapeHtml(c.by)}">${avatar(c.by, false)}</span>` : ""}
        ${c.assignee ? `<span class="ck-assignee">➜ ${avatar(c.assignee, true)}</span>` : ""}
        <button class="ck-del" title="Delete">🗑</button>
      </li>
    `);
    li.querySelector("input").addEventListener("change", () => toggleCheck(c.id));
    li.querySelector(".ck-del").addEventListener("click", () => deleteCheck(c.id));
    ul.appendChild(li);
  }
}

function renderHeader() {
  // Don't overwrite a field the user is actively typing in (matters for live sync).
  const set = (id, val) => {
    const node = document.getElementById(id);
    if (node && document.activeElement !== node) node.value = val || "";
  };
  set("trip-name", trip.name);
  set("trip-start", trip.start);
  set("trip-end", trip.end);
  document.getElementById("who-count").textContent = trip.collaborators.length;
  const me = getMe();
  document.getElementById("me-name").innerHTML = me ? avatar(me, true) : "—";
}

function renderAll() {
  renderHeader();
  renderTimeline();
  renderSuggestions();
  renderChecklist();
  if (document.querySelector('.tab[data-tab="map"]').classList.contains("active")) refreshMap();
}
