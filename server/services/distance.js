// Straight-line ("as the crow flies") distance — not a real road route. Cheap,
// instant, and needs no API key or external service, unlike turn-by-turn
// routing. Good enough for "roughly how far is this" on the delivery
// dashboard; actual navigation still goes through a Maps link (see
// controllers/deliveryController.js), which does know the real roads.
const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { haversineKm };
