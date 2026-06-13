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

  // Per-mode colour legend (only on the full interactive map).
  if (entry.interactive) {
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "map-legend");
      div.innerHTML =
        '<div class="ml-title">Travel mode</div>' +
        Object.entries(TRAVEL_MODES)
          .map(
            ([k, m]) =>
              `<div class="ml-row"><span class="ml-swatch" style="background:${m.color}"></span>${modeIcon(k)} ${m.label}</div>`
          )
          .join("");
      return div;
    };
    legend.addTo(map);
  }

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
      const ico = itemIcon(it);
      const when = formatWhen(it);
      const am = appleMapsUrl(it.location);
      marker.bindPopup(
        `<strong>${ico} ${escapeHtml(it.title)}</strong>` +
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

  // Include flight-arc airport endpoints in the view bounds.
  const flightPts = [];
  for (const it of trip.items) {
    if (it.legMode !== "flight") continue;
    for (const seg of flightSegments(it)) {
      if (seg.fromLoc) flightPts.push([seg.fromLoc.lat, seg.fromLoc.lng]);
      if (seg.toLoc) flightPts.push([seg.toLoc.lat, seg.toLoc.lng]);
    }
  }

  const bounds = L.latLngBounds(latlngs.concat(flightPts));
  entry.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
  // Leaflet needs a nudge when its container was hidden while sizing.
  setTimeout(() => entry.map.invalidateSize(), 50);

  // Draw the route leg-by-leg, following real roads where possible and
  // colouring each leg by its travel mode.
  drawLegs(entry, located);
  // Draw dedicated great-circle arcs for flights with known airports.
  drawFlights(entry);
}

/** Draw great-circle arcs between the entered airports of flight items (per segment). */
function drawFlights(entry) {
  for (const it of trip.items) {
    if (it.legMode !== "flight") continue;
    for (const seg of flightSegments(it)) {
      if (!seg.fromLoc || !seg.toLoc) continue;
      const arc = greatCircle(
        { lat: seg.fromLoc.lat, lng: seg.fromLoc.lng },
        { lat: seg.toLoc.lat, lng: seg.toLoc.lng }
      );
      const line = L.polyline(arc, {
        color: TRAVEL_MODES.flight.color,
        weight: 2.5,
        opacity: 0.9,
        dashArray: "4 6",
      });
      if (entry.interactive) {
        const label = [seg.no, [seg.from, seg.to].filter(Boolean).join(" → ")]
          .filter(Boolean)
          .join(" · ");
        line.bindPopup(`✈️ ${escapeHtml(label || it.title)}`);
      }
      line.addTo(entry.route);
    }
  }
}

let _mapLegToken = 0;

async function drawLegs(entry, located) {
  const token = ++_mapLegToken;
  for (let i = 0; i < located.length - 1; i++) {
    const from = located[i];
    const to = located[i + 1];
    // The mode belongs to the ARRIVING stop (how you got to `to`).
    const mode = to.legMode || "car";
    const m = TRAVEL_MODES[mode] || TRAVEL_MODES.car;

    // Flights are drawn as their own airport-to-airport arc; skip here.
    if (mode === "flight") continue;

    // Fetch the route geometry for this mode (real roads/paths, or transit
    // shape when available); coords stays null -> we draw a straight line.
    const leg = await travelByMode(from.location, to.location, mode);
    if (token !== _mapLegToken) return; // a newer render superseded us
    const coords = leg.coords;

    const straight = [
      [from.location.lat, from.location.lng],
      [to.location.lat, to.location.lng],
    ];
    const isFlight = mode === "flight";
    const line = coords && coords.length
      ? L.polyline(coords, {
          color: m.color,
          weight: isFlight ? 2.5 : 4,
          opacity: 0.85,
          dashArray: isFlight ? "4 6" : null,
        })
      : L.polyline(straight, { color: m.color, weight: 3, opacity: 0.7, dashArray: "6 8" });

    if (token !== _mapLegToken) return;
    if (entry.interactive) line.bindPopup(`${modeIcon(mode)} ${m.label} · ${escapeHtml(from.title)} → ${escapeHtml(to.title)}`);
    line.addTo(entry.route);
  }
}

/** Redraw the full route map (Map tab). */
function refreshMap() {
  refreshMapInto("map", { interactive: true });
}

/** Redraw the overview map. Interactive in the wide desktop "map app" layout,
    static (no scroll-trap) in the small stacked/mobile preview. */
function refreshOverviewMap() {
  if (!document.getElementById("map-overview")) return;
  const wide = window.matchMedia("(min-width: 920px)").matches;
  refreshMapInto("map-overview", { interactive: wide });
}
