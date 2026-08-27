import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { api } from "./api";

// A dedicated Firebase project for this app (devis-kitchen-orders) — separate
// from the cricket-nets-app (Pavilion) project, same "own database, own
// secrets, nothing shared" rule already followed for the Postgres DB and the
// GitHub repo. This config (apiKey included) is public/safe to ship to the
// browser, same category as it being embedded in any Firebase web app —
// actual send-time authority lives only in the server's own service-account
// credential (server/config/firebaseAdmin.js), which never appears here.
const firebaseConfig = {
  apiKey: "AIzaSyCVW2UvFBS2WIL_fj95xwJtgt428DIupgw",
  authDomain: "devis-kitchen-orders.firebaseapp.com",
  projectId: "devis-kitchen-orders",
  storageBucket: "devis-kitchen-orders.firebasestorage.app",
  messagingSenderId: "247846186691",
  appId: "1:247846186691:web:2cd95231e049f53862fc76"
};

// The Web Push certificate's public key, from Firebase Console → this
// project → Project Settings → Cloud Messaging → Web Push certificates.
// Public (same category as apiKey above) — proves to FCM that a token really
// was requested by this app; carries no send authority on its own.
const VAPID_KEY = "BOyfhfGD0OPX4rW9-rtof2P3rYHcxXVJqXVRxGJV9UYFw3Yjr7LmhSsxPe9Sr_4k3tnd7senhnj60jpaSYnuVmE";

const TOKEN_STORAGE_KEY = "devis_kitchen_push_token";

const app = initializeApp(firebaseConfig);

function storedToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function isPushEnabled() {
  return !!storedToken();
}

// Walks a person through the browser's own notification permission prompt,
// registers this device with FCM, and saves the resulting token both on the
// server (so the right controller can find it later) and in localStorage (so
// this device knows it's already opted in, and can unregister later).
// Every failure mode comes back as a real { ok, error } — nothing fails
// silently, since this is an explicit action someone needs to know the
// outcome of.
export async function enablePush() {
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
    return { ok: false, error: "Notifications aren't supported in this browser." };
  }
  if (VAPID_KEY.startsWith("PASTE_")) {
    return { ok: false, error: "Push isn't set up yet — ask the owner to finish the Firebase setup." };
  }
  try {
    const supported = await isSupported();
    if (!supported) return { ok: false, error: "Notifications aren't supported in this browser." };
  } catch {
    return { ok: false, error: "Notifications aren't supported in this browser." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notification permission wasn't granted — check your browser's site settings." };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, error: "Couldn't get a notification token — try again." };

    await api.registerPushToken(token);
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      // Non-fatal — the server-side registration above is what actually
      // matters; losing the local record just means the toggle can't show
      // "on" reliably next visit.
    }
    return { ok: true };
  } catch (e) {
    console.error("enable push failed", e);
    return { ok: false, error: "Couldn't enable notifications — try again." };
  }
}

export async function disablePush() {
  const token = storedToken();
  if (!token) return { ok: true };
  try {
    await api.unregisterPushToken(token);
  } catch (e) {
    console.error("disable push failed", e);
  }
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
  return { ok: true };
}

// sw.js's onBackgroundMessage only fires while this tab isn't focused — with
// the app open, FCM instead hands the message to this listener, and nothing
// shows it unless we explicitly do. Reads from payload.data (not
// payload.notification) for the same reason the server sends data-only —
// see server/services/push.js's comment on why.
export function setupForegroundPushListener() {
  isSupported()
    .then((supported) => {
      if (!supported) return;
      const messaging = getMessaging(app);
      onMessage(messaging, (payload) => {
        const title = (payload.data && payload.data.title) || "Devi's Kitchen";
        const body = (payload.data && payload.data.body) || "";
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
        // Goes through the service worker's own notification API rather than
        // `new Notification(...)` directly — mobile browsers (Android Chrome
        // in particular) don't reliably support the plain constructor from a
        // page; registration.showNotification() is the one path that works
        // consistently everywhere.
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.ready
            .then((registration) => {
              registration.showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" });
            })
            .catch((e) => console.error("foreground showNotification failed", e));
        } else {
          new Notification(title, { body, icon: "/icons/icon-192.png" });
        }
      });
    })
    .catch((e) => console.error("push foreground setup failed", e));
}
