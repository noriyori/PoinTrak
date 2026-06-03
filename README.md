# 📍 PoinTrak — Collaborative Trip Planner

A lightweight, password-protected web app for planning a trip together. Built to
run as a **static site on GitHub Pages** — no servers, no accounts, no API keys.

Made for planning trips with a small group (e.g. you, your partner, and the
friend you're visiting).

## Features

- 🔒 **Password gate** — simple shared password to open the app.
- 🗓 **Itinerary timeline** — grouped by day, ordered by time.
- 🏨🎟️🚗✔️ **Rich entry types** — hotel stays, events (museums, shows),
  travel/transport, and tasks/errands (e.g. *pick up rental car*, *drop off
  rental car*).
- ⏰ **"Leave by" timing** — set an arrival time on each destination and the app
  estimates driving time to the next stop and tells you when to leave (flagging
  ⚠️ tight connections). Uses the free OSRM router with a distance fallback.
- 🗺 **Dynamic route map** — markers and route legs are drawn automatically from
  located timeline entries, in order. Each leg has a **travel mode** (🚗 car /
  🚆 train / 🚲 bike / 🚶 walk): car/bike/walk follow the **real road/path
  geometry** (via OSRM, keyless) colored by mode; train is a straight estimate.
  Add or reorder items and the map updates itself.
- 💡 **Suggestions board** — collaborators propose activities, everyone votes,
  and the best ideas get promoted onto the timeline with one click.
- ✅ **Planning checklist** — shared to-dos with optional assignees.
- 👥 **Collaboration**
  - 🟢 **Realtime sync (optional)** — add a free Firebase config and everyone
    editing the same room sees changes live, across devices. See
    [Realtime sync setup](#realtime-sync-optional).
  - **Share link** — encodes the whole trip in a URL; opening it merges into the
    recipient's planner. (Works even without Firebase.)
  - **Export / Import** — download/upload a `.json` trip file.
  - Merges are **by item id**, so two people's changes combine without clobbering.

## Realtime sync (optional)

By default the app stores everything in your browser and shares via links/files.
To make all three of you edit the **same trip live**:

1. Create a free Firebase project at <https://console.firebase.google.com>.
2. **Build → Realtime Database → Create Database** (start in *test mode*).
3. **Project settings → Your apps → Web app (`</>`)** → copy the config.
4. Paste it into [`js/firebase-config.js`](js/firebase-config.js), set a shared
   `POINTRAK_ROOM` code, then commit & push.
5. Anyone who opens the site (same room + password) now syncs in real time.

The Firebase web config is **not secret** — it's designed to live in client code.
Access is governed by your database rules. A reasonable rule that keeps the data
to people who know the room code:

```json
{
  "rules": {
    "pointrak": {
      "$room": { ".read": true, ".write": true }
    }
  }
}
```

> This is open to anyone who knows your database URL + room code. For a 3-person
> private trip that's usually fine; for anything sensitive, add Firebase Auth.

## The password

The access password is **`trip26`**. To change it, edit `PASSWORD` near the top
of [`js/app.js`](js/app.js).

> Note: this is a client-side gate to keep casual visitors out of a static site.
> It is not strong security — don't store sensitive data here.

## Run locally

It's plain HTML/CSS/JS. Either open `index.html` directly, or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy on GitHub Pages

A workflow at [`.github/workflows/pages.yml`](.github/workflows/pages.yml)
publishes the site automatically. After the first push:

1. Go to your repo → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. The site will be live at `https://<you>.github.io/<repo>/`.

## Maps

The in-app route map uses **Leaflet + OpenStreetMap** with **Nominatim** for
turning place names into coordinates — all free and key-free, so the app works as
a pure static site.

Every location also has an **"Open in Apple Maps ↗"** link (on timeline entries
and map pins). On an iPhone or Mac this opens the native **Apple Maps** app for
directions; elsewhere it opens Apple Maps on the web. This gives the Apple Maps
experience for navigation with no Apple Developer account or cost.

> Switching the *embedded* map to Apple Maps (MapKit JS) is possible but requires
> an Apple Developer Program membership ($99/year) plus a small serverless
> endpoint to sign auth tokens — which is why the free OpenStreetMap map is used
> in-app.

### Route geometry & travel modes

Each leg between stops has a travel mode (🚗 car / 🚆 train / 🚲 bike / 🚶 walk).
Routes are drawn following the real road/path network and colored by mode.

- **Default (no setup):** car/bike/walk geometry comes from the keyless **OSRM**
  driving network; bike/walk times are estimated from distance at realistic speeds.
- **Optional, free upgrade — true bike & walking paths:** add a free
  **OpenRouteService** token in [`js/routing-config.js`](js/routing-config.js)
  (2,000 routes/day). PoinTrak then uses proper cycling and pedestrian networks
  for both geometry and time. See that file for the 2-minute setup.
- **Train** is always a straight-line estimate (no keyless rail/transit routing
  exists).

## Data & privacy

Everything is stored in your browser's `localStorage`. Nothing is uploaded
anywhere except the geocoding lookups sent to OpenStreetMap's Nominatim service
when you type a location.
