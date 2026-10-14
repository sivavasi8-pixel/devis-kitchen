const addresses = require("../data/addresses");
const geocode = require("../services/geocode");
const asyncHandler = require("../middleware/asyncHandler");

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const clip = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : undefined);

exports.listMyAddresses = asyncHandler(async (req, res) => {
  res.json({ addresses: await addresses.getByUserId(req.user.id) });
});

exports.createAddress = asyncHandler(async (req, res) => {
  const address = clip(req.body.address, 500);
  if (!address) throw badRequest("An address is required");
  let lat = req.body.lat === undefined || req.body.lat === null ? null : Number(req.body.lat);
  let lng = req.body.lng === undefined || req.body.lng === null ? null : Number(req.body.lng);
  if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
    throw badRequest("lat/lng must be numbers");
  }
  // No coordinates given (typed by hand, not "use my current location") — best
  // effort forward-geocode so distance-from-store still works for this address
  // later. A failed/slow lookup just leaves it coordinate-less, same as before.
  if (lat === null && lng === null) {
    const geo = await geocode.forwardGeocode(address);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    }
  }
  const created = await addresses.create({
    userId: req.user.id,
    label: clip(req.body.label, 40) || "Home",
    address,
    phone: clip(req.body.phone, 20),
    lat,
    lng,
    isDefault: Boolean(req.body.isDefault)
  });
  res.status(201).json({ address: created });
});

// Ownership check lives here (not just in the SQL's WHERE) so a request for
// someone else's address id comes back as a clean 404, not a silent no-op.
const requireOwnAddress = async (req) => {
  const existing = await addresses.getById(req.params.id);
  if (!existing || existing.userId !== req.user.id) {
    const err = new Error("Address not found");
    err.status = 404;
    throw err;
  }
  return existing;
};

exports.updateAddress = asyncHandler(async (req, res) => {
  await requireOwnAddress(req);
  const fields = {};
  if (req.body.label !== undefined) fields.label = clip(req.body.label, 40) || "Home";
  if (req.body.address !== undefined) {
    const address = clip(req.body.address, 500);
    if (!address) throw badRequest("An address is required");
    fields.address = address;
  }
  if (req.body.phone !== undefined) fields.phone = clip(req.body.phone, 20) || null;
  if (req.body.lat !== undefined) fields.lat = req.body.lat === null ? null : Number(req.body.lat);
  if (req.body.lng !== undefined) fields.lng = req.body.lng === null ? null : Number(req.body.lng);
  // The address text changed but no new coordinates came with it — the old
  // lat/lng would now point at the wrong place, so re-geocode rather than
  // leave a stale pin attached to the new text.
  if (fields.address !== undefined && req.body.lat === undefined && req.body.lng === undefined) {
    const geo = await geocode.forwardGeocode(fields.address);
    fields.lat = geo ? geo.lat : null;
    fields.lng = geo ? geo.lng : null;
  }
  const updated = await addresses.update(req.params.id, req.user.id, fields);
  res.json({ address: updated });
});

exports.deleteAddress = asyncHandler(async (req, res) => {
  await requireOwnAddress(req);
  await addresses.remove(req.params.id, req.user.id);
  res.status(204).end();
});

exports.setDefaultAddress = asyncHandler(async (req, res) => {
  await requireOwnAddress(req);
  const updated = await addresses.setDefault(req.params.id, req.user.id);
  res.json({ address: updated });
});
