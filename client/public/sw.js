// Deliberately does no caching. This app is a live order/inventory dashboard —
// caching API responses (or even the HTML shell) risks an owner, staff member,
// or rider looking at stale orders/stock without realizing it. This service
// worker exists purely so the browser considers the app "installable" (Add to
// Home Screen / Install app) — every request still goes straight to the
// network, always fresh.

// Push notifications: this is the SAME service worker as the installability
// logic below, not a separate firebase-messaging-sw.js — a page can only
// really have one active service worker at the root scope, so background FCM
// handling is merged in here rather than fighting over that scope. Same
// approach as the reference cricket-nets-app (Pavilion).
// firebaseConfig below is not secret (identical to client/src/push.js, itself
// safe to ship to the browser), and this file only ever displays a
// notification — it never sends one, so no credential capable of sending
// anything lives here.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCVW2UvFBS2WIL_fj95xwJtgt428DIupgw",
  authDomain: "devis-kitchen-orders.firebaseapp.com",
  projectId: "devis-kitchen-orders",
  storageBucket: "devis-kitchen-orders.firebasestorage.app",
  messagingSenderId: "247846186691",
  appId: "1:247846186691:web:2cd95231e049f53862fc76"
});

// Only fires while the app isn't the focused tab (or is closed entirely) — a
// foreground push is handled by the page itself (client/src/push.js's own
// onMessage listener), not this one.
//
// Reads from payload.data, not payload.notification — the server sends
// data-only messages on purpose (see server/services/push.js) so this stays
// the single place a notification actually gets shown, instead of the
// browser's push service also auto-displaying its own on top.
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = (payload.data && payload.data.title) || "Devi's Kitchen";
  const body = (payload.data && payload.data.body) || "";
  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png"
  });
});

// Tapping the notification focuses an already-open tab if one exists,
// otherwise opens a new one — without this, a data-only notification (unlike
// FCM's auto-displayed ones) has no click behavior at all.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
