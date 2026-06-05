/* ============================================================
   app.js — state mutations + event wiring + boot
   ============================================================ */

const PASSWORD = "trip26";

/* ---------- Mutations (each saves + re-renders) ---------- */
function upsertItem(data) {
  const i = trip.items.findIndex((x) => x.id === data.id);
  if (i >= 0) trip.items[i] = data;
  else trip.items.push(data);
  saveTrip();
  syncSet("items", data);
  renderTimeline();
  refreshMap();
  refreshOverviewIfActive();
  toast(i >= 0 ? "Itinerary updated" : "Added to itinerary");
}
function deleteItem(id) {
  trip.items = trip.items.filter((x) => x.id !== id);
  saveTrip();
  syncRemove("items", id);
  renderTimeline();
  refreshMap();
  refreshOverviewIfActive();
  toast("Removed");
}
function toggleItemDone(id) {
  const it = trip.items.find((x) => x.id === id);
  if (it) { it.done = !it.done; saveTrip(); syncSet("items", it); renderTimeline(); refreshOverviewIfActive(); }
}
function addComment(collection, id, text) {
  const entity = (trip[collection] || []).find((x) => x.id === id);
  if (!entity) return;
  entity.comments = entity.comments || [];
  entity.comments.push({ id: uid(), by: getMe() || "Someone", text, ts: Date.now() });
  saveTrip();
  syncSet(collection, entity);
  if (collection === "items") renderTimeline();
  else renderSuggestions();
}

function addSuggestion(s) {
  trip.suggestions.push(s);
  saveTrip();
  syncSet("suggestions", s);
  renderSuggestions();
  refreshOverviewIfActive();
  toast("Suggestion added");
}
function voteSuggestion(id) {
  const s = trip.suggestions.find((x) => x.id === id);
  if (!s) return;
  const me = getMe() || "anon";
  s.voters = s.voters || [];
  if (s.voters.includes(me)) {
    s.voters = s.voters.filter((v) => v !== me);
    s.votes = Math.max(0, (s.votes || 0) - 1);
  } else {
    s.voters.push(me);
    s.votes = (s.votes || 0) + 1;
  }
  saveTrip();
  syncSet("suggestions", s);
  renderSuggestions();
  refreshOverviewIfActive();
}
function removeSuggestion(id) {
  trip.suggestions = trip.suggestions.filter((x) => x.id !== id);
  saveTrip();
  syncRemove("suggestions", id);
  renderSuggestions();
  refreshOverviewIfActive();
}
function acceptSuggestion(id, date) {
  const s = trip.suggestions.find((x) => x.id === id);
  if (!s) return;
  s.accepted = true;
  const newItem = {
    id: uid(),
    type: "event",
    title: s.title,
    date: date || "",
    time: "",
    notes: s.notes ? `From suggestion by ${s.by}: ${s.notes}` : `Suggested by ${s.by}`,
    location: s.location || null,
    done: false,
    by: s.by,
  };
  trip.items.push(newItem);
  saveTrip();
  syncSet("suggestions", s);
  syncSet("items", newItem);
  renderSuggestions();
  renderTimeline();
  refreshMap();
  refreshOverviewIfActive();
  toast(date ? `Added to ${prettyDate(date)}` : "Added to timeline — set a date to schedule it");
}

function addCheck(text, assignee) {
  const c = { id: uid(), text, assignee: assignee || "", done: false, by: getMe() };
  trip.checklist.push(c);
  saveTrip();
  syncSet("checklist", c);
  renderChecklist();
  refreshOverviewIfActive();
}
function toggleCheck(id) {
  const c = trip.checklist.find((x) => x.id === id);
  if (c) { c.done = !c.done; saveTrip(); syncSet("checklist", c); renderChecklist(); refreshOverviewIfActive(); }
}
function deleteCheck(id) {
  trip.checklist = trip.checklist.filter((x) => x.id !== id);
  saveTrip();
  syncRemove("checklist", id);
  renderChecklist();
  refreshOverviewIfActive();
}

/* ---------- Save indicator ---------- */
function onTripSaved() {
  const s = document.getElementById("save-status");
  if (!s) return;
  // Don't stomp the "live sync on" indicator managed by sync.js.
  if (s.dataset.live === "1") return;
  s.textContent = "Saved · " + new Date().toLocaleTimeString();
}

/* ---------- Auth ---------- */
const AUTH_KEY = "pointrak.unlockedUntil";
const AUTH_DAYS = 60; // stay unlocked this long between visits

function isUnlocked() {
  const until = Number(localStorage.getItem(AUTH_KEY) || 0);
  return until > Date.now();
}
function rememberUnlock() {
  localStorage.setItem(AUTH_KEY, String(Date.now() + AUTH_DAYS * 86400000));
}

function unlock() {
  document.getElementById("lock-screen").hidden = true;
  document.getElementById("app").hidden = false;
  bootApp();
}

function setupLock() {
  // Stay unlocked across reopens (handy for the iOS home-screen app).
  if (isUnlocked()) {
    rememberUnlock(); // sliding renewal
    unlock();
    return;
  }
  const form = document.getElementById("lock-form");
  const input = document.getElementById("password-input");
  const err = document.getElementById("lock-error");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (input.value === PASSWORD) {
      rememberUnlock();
      unlock();
    } else {
      err.hidden = false;
      input.value = "";
      input.focus();
    }
  });
}

/* ---------- Boot ---------- */
let _booted = false;
function bootApp() {
  if (_booted) return;
  _booted = true;

  tryLoadTripFromHash();

  renderAll();
  wireEvents();
  initSync();

  // Ask who you are (once) so every edit is attributed.
  if (!getMe()) identityPicker();
}

function wireEvents() {
  // Tabs
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // Trip settings (consolidated top-bar menu)
  document.getElementById("btn-settings").addEventListener("click", () => tripSettings());
  document.getElementById("trip-name-display").addEventListener("click", () => tripSettings());

  // Add buttons
  document.getElementById("btn-add-item").addEventListener("click", () => itemEditor(null));
  document.getElementById("btn-add-suggestion").addEventListener("click", () => suggestionEditor());

  // Checklist
  document.getElementById("checklist-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("checklist-input");
    const who = document.getElementById("checklist-assignee");
    if (!input.value.trim()) return;
    addCheck(input.value.trim(), who.value.trim());
    input.value = ""; who.value = "";
  });

  // Modal close
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
  });

  // Identity (footer "change")
  document.getElementById("btn-rename-me").addEventListener("click", () => identityPicker());

  // Import (button lives in Trip settings; the hidden file input stays in the header)
  document.getElementById("file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importTripFromText(reader.result);
        renderAll();
        toast("Trip imported & merged");
      } catch (err) {
        toast("Couldn't read that file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
}

/* ---------- Share & lock (used from Trip settings) ---------- */
function shareModal() {
  const link = encodeTripToHash();
  const live = syncEnabled();
  const liveNote = live
    ? `<p class="empty-hint">🟢 <strong>Live sync is on</strong> (room
       "${escapeHtml(window.POINTRAK_ROOM || "our-trip")}"). Just send your wife &amp;
       friend this page's URL — once they unlock with the password, everyone's edits
       appear instantly. The snapshot link below is a handy backup.</p>`
    : `<p class="empty-hint">Send this link to your wife and friend. Opening it loads
       &amp; merges this trip into their planner. They can edit, then share their link
       back — changes merge by item, so nothing gets lost.</p>`;
  openModal(`
    <h2>Share / sync this trip</h2>
    ${liveNote}
    <textarea class="share-box" readonly>${escapeHtml(link)}</textarea>
    <div class="modal-actions">
      <button class="primary" id="copy-link">Copy snapshot link</button>
    </div>
  `);
  document.getElementById("copy-link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied");
    } catch {
      toast("Select the text and copy manually");
    }
  });
}

function lockApp() {
  localStorage.removeItem(AUTH_KEY);
  location.reload();
}

/* ---------- Start ---------- */
document.addEventListener("DOMContentLoaded", setupLock);
