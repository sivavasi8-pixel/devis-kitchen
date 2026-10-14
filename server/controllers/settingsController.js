const settings = require("../data/settings");
const geocode = require("../services/geocode");
const ordering = require("../services/ordering");
const asyncHandler = require("../middleware/asyncHandler");

// Explicit allowlist of what GET exposes publicly (no auth — the checkout page
// needs the UPI fields before a customer necessarily has an account, and the
// shop address/location is just the storefront's own public info) —
// app_settings is a free-form store and could hold owner-only values later,
// so nothing is returned by default.
const PUBLIC_KEYS = ["upiVpa", "upiPayeeName", "shopAddress", "shopLat", "shopLng"];

exports.getPublicSettings = asyncHandler(async (req, res) => {
  const all = await settings.getAll();
  const out = {};
  for (const k of PUBLIC_KEYS) out[k] = all[k] || null;
  out.ordering = await ordering.getConfig();
  res.json(out);
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const { upiVpa, upiPayeeName, shopAddress, shopLat, shopLng, ordering: orderingConfig } = req.body;
  // Validated up front so a bad hours/zone entry rejects the whole save, not half of it.
  if (orderingConfig !== undefined) await ordering.saveConfig(orderingConfig);
  if (upiVpa !== undefined) await settings.set("upiVpa", upiVpa ? String(upiVpa).trim() : "");
  if (upiPayeeName !== undefined) await settings.set("upiPayeeName", upiPayeeName ? String(upiPayeeName).trim() : "");

  if (shopAddress !== undefined) {
    const address = String(shopAddress).trim();
    await settings.set("shopAddress", address);

    // The owner can pin an exact location with "Use my current location" while
    // physically at the shop — if they didn't (or haven't yet), best-effort
    // forward-geocode the typed address instead, same as a customer's address
    // book entry, so "distance from store" still works without requiring a
    // precise manual pin.
    if (shopLat === undefined && shopLng === undefined && address) {
      const geo = await geocode.forwardGeocode(address);
      if (geo) {
        await settings.set("shopLat", String(geo.lat));
        await settings.set("shopLng", String(geo.lng));
      }
    }
  }
  if (shopLat !== undefined) await settings.set("shopLat", shopLat === null ? "" : String(shopLat));
  if (shopLng !== undefined) await settings.set("shopLng", shopLng === null ? "" : String(shopLng));

  const all = await settings.getAll();
  const out = {};
  for (const k of PUBLIC_KEYS) out[k] = all[k] || null;
  out.ordering = await ordering.getConfig();
  res.json(out);
});
