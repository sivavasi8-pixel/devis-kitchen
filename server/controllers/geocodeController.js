const geocode = require("../services/geocode");
const asyncHandler = require("../middleware/asyncHandler");

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// Shared across any logged-in role — an owner setting the shop's location
// (Settings) and a customer adding a delivery address both need the same
// "turn coordinates into a readable address" and "turn a pasted Maps link
// into coordinates" lookups.
exports.reverse = asyncHandler(async (req, res) => {
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw badRequest("lat and lng are required numbers");
  res.json({ address: await geocode.reverseGeocode(lat, lng), lat, lng });
});

exports.resolveLink = asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) throw badRequest("url is required");
  const result = await geocode.resolveMapsLink(url);
  if (!result || result.error) return res.status(400).json({ error: (result && result.error) || "Couldn't read that link" });
  res.json(result);
});
