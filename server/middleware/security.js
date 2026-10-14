// Small, dependency-free security middleware (the same ideas as the `helmet` and
// `express-rate-limit` packages, kept in-house so the server needs nothing new).

// Standard protective response headers.
function securityHeaders(req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff", // don't let a browser guess a file is HTML/JS
    "X-Frame-Options": "DENY", // nobody can embed the app in an iframe to trick clicks
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    // geolocation=(self): "use my current location" in the delivery address
    // picker needs it; still denied to any iframe or cross-origin embed.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=()"
  });
  // Only meaningful over HTTPS (Render always is) — tells browsers to never use plain HTTP.
  if (req.secure) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

// Fixed-window, in-memory rate limit keyed by client IP. Fine for a single Render
// instance; it resets on restart, which is acceptable for slowing down password
// guessing. Needs `app.set("trust proxy", 1)` so req.ip is the visitor, not Render's proxy.
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();

  // Drop expired entries now and then so the map can't grow forever.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  sweep.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || "unknown";
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

module.exports = { securityHeaders, rateLimit };
