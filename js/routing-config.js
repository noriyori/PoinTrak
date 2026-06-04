/* ============================================================
   routing-config.js — OpenRouteService (optional)

   Enables TRUE cycling & walking path routing (and car) instead of
   approximating with the driving road network. Free.

   --- One-time setup (about 2 minutes) ---
   1. Sign up (free) at https://openrouteservice.org/dev/#/signup
   2. Verify your email and log in to the dashboard.
   3. Under "Tokens", request a free token (the "Standard" free plan
      gives 2,000 routing requests/day — plenty for trip planning).
   4. Copy the token and paste it below, then commit & push.

   Without a key, PoinTrak falls back to OSRM driving geometry, so the
   app keeps working either way.

   NOTE: this token will be visible in the published site's source.
   ORS free tokens are rate-limited and low-risk, but treat it as
   semi-public — don't paste a token you also use for anything sensitive.
   ============================================================ */

window.ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImFiMjYxN2RiZDc0MzRkNmJiNTRiM2RiNzcxYmQ3MjdkIiwiaCI6Im11cm11cjY0In0=";

/* ============================================================
   Navitia (optional) — REAL public-transit routing for the
   🚆 Transit mode (trains, metro, tram, bus + walking transfers).
   Free developer plan.

   --- Setup ---
   1. Sign up (free) at https://navitia.io/  → "Get a token".
   2. Copy your token and paste it below, then commit & push.

   Coverage note: Navitia's open data is excellent across Europe
   (and several other regions) but not everywhere. Where there's no
   transit coverage, the Transit mode falls back to a straight-line
   time estimate. Like the others, this token is visible in the
   published site — fine for a private trip, but treat it as semi-public.
   ============================================================ */
window.NAVITIA_API_KEY = "PASTE_NAVITIA_TOKEN";
