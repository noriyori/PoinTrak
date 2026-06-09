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
   Public transit (🚆 Transit mode) needs NO key.
   It uses Transitous (https://transitous.org), a free, community-run
   MOTIS routing service covering openly-published GTFS transit feeds.
   Where a region has no transit feed yet, the Transit mode falls back
   to a straight-line time estimate. Nothing to configure here.
   ============================================================ */

/* ============================================================
   AeroDataBox (optional) — look up a flight by its number to
   auto-fill the airports and times in a ✈️ Flight item.

   --- Setup (free tier) ---
   1. Create a free RapidAPI account: https://rapidapi.com/auth/sign-up
   2. Open the AeroDataBox API:
      https://rapidapi.com/aedbx-aedbx/api/aerodatabox
   3. Click "Subscribe to Test" and pick the free "Basic" plan
      (a few hundred calls/month — plenty for entering a trip).
   4. On the API's Endpoints page, copy your "X-RapidAPI-Key"
      (Application Key) and paste it below, then commit & push.

   Note: the key is visible in the published site (like the others) and
   RapidAPI may rate-limit. If lookups fail with a network/CORS error in
   the browser, tell me and I'll add a tiny proxy.
   ============================================================ */
window.AERODATABOX_RAPIDAPI_KEY = "8d0d148958msh522b414f7fbe496p1c540ajsn654adfc9d311";

/* ============================================================
   Google Places API (New) (optional) — powers "City visit"
   suggestions (top things to do) and rich place details/photos.

   --- Setup (free tier; ~ $200/mo credit, no charge for normal use) ---
   1. Go to https://console.cloud.google.com/ and create a project.
   2. APIs & Services → Library → enable "Places API (New)".
   3. APIs & Services → Credentials → Create credentials → API key.
   4. (Recommended) Edit the key → Application restrictions: "Websites",
      add your site (e.g. https://noriyori.github.io/*). API restrictions:
      restrict to "Places API (New)".
   5. Set up a billing account (required even for the free tier).
   6. Paste the key below, then commit & push.

   Without a key, City visit still lets you add stops manually. The key is
   visible in the published site, so the website restriction above matters.
   ============================================================ */
window.GOOGLE_API_KEY = "PASTE_GOOGLE_API_KEY";
