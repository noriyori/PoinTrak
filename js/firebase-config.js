/* ============================================================
   firebase-config.js — paste your Firebase project config here
   to turn on realtime sync across devices.

   These values are NOT secret. Firebase web config is meant to
   live in client-side code; access is controlled by database rules.

   --- One-time setup (about 3 minutes) ---
   1. Go to https://console.firebase.google.com and "Add project"
      (you can disable Google Analytics — not needed).
   2. In the left menu: Build → Realtime Database → "Create Database".
      Pick a location, then start in "test mode" (see README for a
      slightly tighter rule you can paste later).
   3. Project Overview (gear icon) → Project settings → scroll to
      "Your apps" → click the web icon  </>  → register an app.
   4. Copy the config object it shows you and paste it below,
      replacing the PASTE_… placeholders. Make sure databaseURL is set.
   5. Commit & push. Done — everyone who opens the site with the same
      ROOM code below now edits the same trip live.
   ============================================================ */

window.FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT.firebaseapp.com",
  databaseURL: "https://PASTE_PROJECT-default-rtdb.firebaseio.com",
  projectId: "PASTE_PROJECT",
  appId: "PASTE_APP_ID",
};

// Everyone planning the SAME trip must use the SAME room code.
// Change it to start a separate, private trip.
window.POINTRAK_ROOM = "our-trip";
