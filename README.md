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
- 🗺 **Dynamic route map** — markers and a route line are drawn automatically
  from timeline entries that have a location, in chronological order. Add or
  reorder items and the map updates itself.
- 💡 **Suggestions board** — collaborators propose activities, everyone votes,
  and the best ideas get promoted onto the timeline with one click.
- ✅ **Planning checklist** — shared to-dos with optional assignees.
- 👥 **Collaboration** — works without a backend via:
  - **Share link** — encodes the whole trip in a URL; opening it merges into the
    recipient's planner.
  - **Export / Import** — download/upload a `.json` trip file.
  - Merges are **by item id**, so two people's changes combine without clobbering.

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

## Data & privacy

Everything is stored in your browser's `localStorage`. Nothing is uploaded
anywhere except the geocoding lookups sent to OpenStreetMap's Nominatim service
when you type a location.
