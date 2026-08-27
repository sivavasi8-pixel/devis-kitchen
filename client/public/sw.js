// Deliberately does no caching. This app is a live order/inventory dashboard —
// caching API responses (or even the HTML shell) risks an owner, staff member,
// or rider looking at stale orders/stock without realizing it. This service
// worker exists purely so the browser considers the app "installable" (Add to
// Home Screen / Install app) — every request still goes straight to the
// network, always fresh.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
