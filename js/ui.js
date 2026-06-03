/* ============================================================
   ui.js — rendering, modals, helpers
   ============================================================ */

const ITEM_TYPES = {
  hotel:  { icon: "🏨", label: "Hotel stay" },
  event:  { icon: "🎟️", label: "Event / activity" },
  travel: { icon: "🚗", label: "Travel / transport" },
  task:   { icon: "✔️", label: "Task / errand" },
};

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
      if (it.by) chips.push(`<span class="chip">👤 ${escapeHtml(it.by)}</span>`);

      const card = el(`
        <div class="tl-item ${it.done ? "tl-done" : ""}" data-type="${it.type}">
          <div class="tl-icon">${meta.icon}</div>
          <div class="tl-main">
            <p class="tl-title">${escapeHtml(it.title)}</p>
            <div class="tl-meta">${chips.join("")}</div>
            ${it.notes ? `<p class="tl-notes">${escapeHtml(it.notes)}</p>` : ""}
          </div>
          <div class="tl-actions">
            <button data-act="done">${it.done ? "↺" : "✓"}</button>
            <button data-act="edit">✎</button>
          </div>
        </div>
      `);
      card.querySelector('[data-act="edit"]').addEventListener("click", () => itemEditor(it));
      card.querySelector('[data-act="done"]').addEventListener("click", () => toggleItemDone(it.id));
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
    const card = el(`
      <div class="card ${s.accepted ? "accepted" : ""}">
        <h3>${escapeHtml(s.title)}</h3>
        <div class="by">by ${escapeHtml(s.by || "someone")}${s.location?.name ? " · 📍 " + escapeHtml(s.location.name) : ""}</div>
        ${s.notes ? `<div class="notes">${escapeHtml(s.notes)}</div>` : ""}
        <div class="card-foot">
          <button class="vote">👍 ${s.votes || 0}</button>
          <span class="spacer"></span>
          ${s.accepted ? '<span class="by">✓ on timeline</span>'
            : '<button class="mini accept">Add to timeline</button><button class="mini del">Remove</button>'}
        </div>
      </div>
    `);
    card.querySelector(".vote").addEventListener("click", () => voteSuggestion(s.id));
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
        ${c.assignee ? `<span class="ck-assignee">${escapeHtml(c.assignee)}</span>` : ""}
        <button class="ck-del" title="Delete">🗑</button>
      </li>
    `);
    li.querySelector("input").addEventListener("change", () => toggleCheck(c.id));
    li.querySelector(".ck-del").addEventListener("click", () => deleteCheck(c.id));
    ul.appendChild(li);
  }
}

function renderHeader() {
  document.getElementById("trip-name").value = trip.name || "";
  document.getElementById("trip-start").value = trip.start || "";
  document.getElementById("trip-end").value = trip.end || "";
  document.getElementById("who-count").textContent = trip.collaborators.length;
  document.getElementById("me-name").textContent = getMe() || "—";
}

function renderAll() {
  renderHeader();
  renderTimeline();
  renderSuggestions();
  renderChecklist();
  if (document.querySelector('.tab[data-tab="map"]').classList.contains("active")) refreshMap();
}
