// OpenStreetMap Nominatim — free, no API key, but rate-limited and requires an
// identifying User-Agent (its usage policy), which only a server-side request
// can set. Every function here is best-effort: a slow network or an address
// Nominatim can't find must never break checkout or the address book, so every
// failure (including a timeout) just resolves to null rather than throwing.
const USER_AGENT = "DevisKitchen/1.0 (contact: owner@devis.test)";

exports.reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, {
      headers: { "User-Agent": USER_AGENT }
    });
    const data = await res.json();
    return data && data.display_name ? data.display_name : null;
  } catch {
    return null;
  }
};

// Address text -> coordinates, for an address typed by hand (no GPS capture) —
// lets distance-from-store still work for the common case. Capped at a short
// timeout so a slow Nominatim response can't noticeably delay checkout.
exports.forwardGeocode = async (address, { timeoutMs = 4000 } = {}) => {
  if (!address) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { "User-Agent": USER_AGENT }, signal: controller.signal }
    );
    const data = await res.json();
    if (!Array.isArray(data) || !data[0]) return null;
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// Only Google's own domains are ever fetched — a pasted link's host is
// checked BEFORE any request goes out, so this can't be turned into an SSRF
// proxy for an arbitrary URL (the short-link domains redirect entirely within
// Google's own infrastructure, which an attacker can't redirect elsewhere).
const isGoogleMapsHost = (hostname) => {
  const h = hostname.toLowerCase();
  return h === "goo.gl" || h === "maps.app.goo.gl" || h === "google.com" || h.endsWith(".google.com");
};

// "@lat,lng,zoom" (a full Maps URL), "q=lat,lng" or "ll=lat,lng" (an older-style
// link/shortlink redirect target) — covers every real-world Google Maps link
// shape this is likely to see pasted in.
const COORD_PATTERNS = [/@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/];

// A pasted Google Maps link (full or shortened) -> coordinates. Resolves
// shortlinks by following their redirect (Node's fetch does this itself, up
// to 20 hops) and reads the coordinates out of wherever the final URL lands.
exports.resolveMapsLink = async (url, { timeoutMs = 6000 } = {}) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "That doesn't look like a valid link" };
  }
  if (!isGoogleMapsHost(parsed.hostname)) {
    return { error: "Please paste a Google Maps link (maps.google.com or a goo.gl share link)" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let finalUrl;
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
    finalUrl = res.url;
  } catch {
    return { error: "Couldn't open that link — check your connection and try again" };
  } finally {
    clearTimeout(timer);
  }
  for (const pattern of COORD_PATTERNS) {
    const m = finalUrl.match(pattern);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return { error: "Couldn't find a pinned location in that link — try 'Pick on map' instead" };
};
