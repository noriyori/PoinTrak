/* ============================================================
   map.js — Leaflet route map that redraws from the timeline
   ============================================================ */

let _map = null;
let _markersLayer = null;
let _routeLayer = null;
let _mapReady = false;

function initMap() {
  if (_mapReady) return;
  _map = L.map("map", { scrollWheelZoom: true }).setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(_map);

  _markersLayer = L.layerGroup().addTo(_map);
  _routeLayer = L.layerGroup().addTo(_map);
  _mapReady = true;
}

/** Numbered circular marker matching itinerary order. */
function numberedIcon(n, type) {
  const colors = {
    hotel: "#a78bfa", event: "#4f9dff", travel: "#34d399", task: "#fbbf24",
  };
  const bg = colors[type] || "#4f9dff";
  return L.divIcon({
    className: "",
    html: `<div class="map-marker-num" style="background:${bg}">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Redraw markers + route line from timeline items that have coordinates.
 * Called whenever the timeline changes or the Map tab is opened.
 */
function refreshMap() {
  if (!_mapReady) initMap();
  _markersLayer.clearLayers();
  _routeLayer.clearLayers();

  const located = orderedItems().filter(
    (it) => it.location && typeof it.location.lat === "number"
  );

  if (!located.length) {
    _map.setView([20, 0], 2);
    return;
  }

  const latlngs = [];
  located.forEach((it, i) => {
    const ll = [it.location.lat, it.location.lng];
    latlngs.push(ll);
    const icon = ITEM_TYPES[it.type]?.icon || "📍";
    const when = formatWhen(it);
    L.marker(ll, { icon: numberedIcon(i + 1, it.type) })
      .bindPopup(
        `<strong>${icon} ${escapeHtml(it.title)}</strong>` +
          (when ? `<br><span style="color:#666">${escapeHtml(when)}</span>` : "") +
          (it.location.label
            ? `<br><span style="color:#888;font-size:11px">${escapeHtml(it.location.label)}</span>`
            : "")
      )
      .addTo(_markersLayer);
  });

  if (latlngs.length > 1) {
    L.polyline(latlngs, {
      color: "#4f9dff",
      weight: 3,
      opacity: 0.8,
      dashArray: "6 8",
    }).addTo(_routeLayer);
  }

  const bounds = L.latLngBounds(latlngs);
  _map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  // Leaflet needs a nudge when its container was hidden while sizing.
  setTimeout(() => _map.invalidateSize(), 50);
}
