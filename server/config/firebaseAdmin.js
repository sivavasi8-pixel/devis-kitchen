// FIREBASE_SERVICE_ACCOUNT holds the *entire* contents of the service-account
// JSON file from Firebase Console → devis-kitchen-orders project → Project
// Settings → Service Accounts → Generate new private key, pasted in as one
// string — same "secret lives only in server/.env + Render, never in git or
// the browser" rule as DATABASE_URL and JWT_SECRET.
//
// A separate, dedicated Firebase project (devis-kitchen-orders) — not shared
// with the cricket-nets-app (Pavilion) project, same "own database, own
// secrets" isolation already followed for Postgres and the GitHub repo.
//
// Lazily initialized and tolerant of a missing/invalid credential: push
// notifications are additive (the app already works without them), so a
// misconfigured or not-yet-set-up credential should log once and let every
// caller no-op, never crash a request that happens to trigger a push.
const admin = require("firebase-admin");

let app = null;
let initTried = false;

function getFirebaseApp() {
  if (initTried) return app;
  initTried = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn("FIREBASE_SERVICE_ACCOUNT not set — push notifications are disabled.");
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    app = admin.initializeApp({ credential: admin.cert(serviceAccount) });
    return app;
  } catch (e) {
    console.error("Failed to initialize Firebase Admin (bad FIREBASE_SERVICE_ACCOUNT?):", e.message);
    return null;
  }
}

module.exports = { getFirebaseApp };
