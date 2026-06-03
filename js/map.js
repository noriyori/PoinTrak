/* ============================================================
   map.js — Leaflet route map(s) that redraw from the timeline.
   Supports multiple map instances (full "map" + overview mini-map),
   each tracked by its container element id.
   ============================================================ */

const _maps = {}; // id -> { map, markers, route, interactive }

function ensureMap(id, opts = {}) {
  const node = document.getElementById(id);
  if (!node) return null;
  const existing = _maps[id];
  if (existing) {
    // Reuse only if still attached to the current DOM node. The overview
    // map's container is recreated whenever the dashboard re-renders.
    if (existing.map.getContainer() === node) return existing;
    existing.map.remove();
    delete _maps[id];
  }

  const map = L.map(id, {
    scrollWheelZoom: opts.interactive !== false,
    zoomControl: opts.interactive !== false,
    dragging: opts.interactive !== false,
  }).setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const entry = {
    map,
    markers: L.layerGroup().addTo(map),
    route: L.layerGroup().addTo(map),
    interactive: opts.interactive !== false,
  };
  _maps[id] = entry;
  return entry;
}

/** Numbered circular marker matching itinerary order. */
function numberedIcon(n, type) {
  const colors = {
    hotel: "#8b5cf6", event: "#2563eb", travel: "#059669", task: "#d97706",
  };
  const bg = colors[type] || "#2563eb";
  return L.divIcon({
    className: "",
    html: `<div class="map-marker-num" style="background:${bg}">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Redraw markers + route line into a given map from located timeline items.
 */
function refreshMapInto(id, opts = {}) {
  const entry = ensureMap(id, opts);
  if (!entry) return;
  entry.markers.clearLayers();
  entry.route.clearLayers();

  const located = orderedItems().filter(
    (it) => it.location && typeof it.location.lat === "number"
  );

  if (!located.length) {
    entry.map.setView([20, 0], 2);
    setTimeout(() => entry.map.invalidateSize(), 50);
    return;
  }

  const latlngs = [];
  located.forEach((it, i) => {
    const ll = [it.location.lat, it.location.lng];
    latlngs.push(ll);
    const marker = L.marker(ll, { icon: numberedIcon(i + 1, it.type) });
    if (entry.interactive) {
      const icon = ITEM_TYPES[it.type]?.icon || "📍";
      const when = formatWhen(it);
      const am = appleMapsUrl(it.location);
      marker.bindPopup(
        `<strong>${icon} ${escapeHtml(it.title)}</strong>` +
          (when ? `<br><span style="color:#666">${escapeHtml(when)}</span>` : "") +
          (it.location.label
            ? `<br><span style="color:#888;font-size:11px">${escapeHtml(it.location.label)}</span>`
            : "") +
          (am
            ? `<br><a href="${am}" target="_blank" rel="noopener" style="color:#2563eb;font-size:12px">Open in Apple Maps ↗</a>`
            : "")
      );
    }
    marker.addTo(entry.markers);
  });

  const bounds = L.latLngBounds(latlngs);
  entry.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
  // Leaflet needs a nudge when its container was hidden while sizing.
  setTimeout(() => entry.map.invalidateSize(), 50);

  // Draw the route leg-by-leg, following real roads where possible and
  // colouring each leg by its travel mode.
  drawLegs(entry, located);
}

let _mapLegToken = 0;

async function drawLegs(entry, located) {
  const token = ++_mapLegToken;
  for (let i = 0; i < located.length - 1; i++) {
    const from = located[i];
    const to = located[i + 1];
    const mode = from.legMode || "car";
    const m = TRAVEL_MODES[mode] || TRAVEL_MODES.car;

    let coords = null;
    if (m.routed) {
      const leg = await routeLeg(from.location, to.location);
      if (token !== _mapLegToken) return; // a newer render superseded us
      coords = leg.coords;
    }

    const straight = [
      [from.location.lat, from.location.lng],
      [to.location.lat, to.location.lng],
    ];
    const line = coords && coords.length
      ? L.polyline(coords, { color: m.color, weight: 4, opacity: 0.85 })
      : L.polyline(straight, { color: m.color, weight: 3, opacity: 0.7, dashArray: "6 8" });

    if (token !== _mapLegToken) return;
    if (entry.interactive) line.bindPopup(`${m.icon} ${m.label} · ${escapeHtml(from.title)} → ${escapeHtml(to.title)}`);
    line.addTo(entry.route);
  }
}

/** Redraw the full route map (Map tab). */
function refreshMap() {
  refreshMapInto("map", { interactive: true });
}

/** Redraw the compact overview map if its container is on screen. */
function refreshOverviewMap() {
  if (document.getElementById("map-overview")) {
    refreshMapInto("map-overview", { interactive: false });
  }
}
