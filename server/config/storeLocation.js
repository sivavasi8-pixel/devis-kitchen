// The restaurant's own coordinates, used to compute "X km away" for riders.
// Reads the owner-configured value from Settings first; falls back to a rough
// city-centre default only until that's been set.
const settings = require("../data/settings");

// Fallback — a rough Bengaluru city-centre point, not an exact restaurant pin.
// Once the owner sets a precise location from the Settings page (ideally via
// "Use my current location" while physically at the restaurant), that value
// takes over everywhere this is used.
const DEFAULT_LAT = 12.9716;
const DEFAULT_LNG = 77.5946;

async function getStoreLocation() {
  const all = await settings.getAll();
  const lat = all.shopLat ? Number(all.shopLat) : null;
  const lng = all.shopLng ? Number(all.shopLng) : null;
  return {
    lat: Number.isFinite(lat) ? lat : DEFAULT_LAT,
    lng: Number.isFinite(lng) ? lng : DEFAULT_LNG
  };
}

module.exports = { getStoreLocation };
