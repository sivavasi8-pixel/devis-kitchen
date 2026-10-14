const crypto = require("crypto");
const menuItems = require("../data/menuItems");
const asyncHandler = require("../middleware/asyncHandler");

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// Serves an uploaded photo with an ETag so a replaced image is picked up immediately.
// Cache-Control: no-cache makes the browser always revalidate — cheap (just a hash
// compare, 304 with no body) rather than blindly trusting a time-based cache, which
// would let a replaced photo show stale at the same URL.
const sendImage = (req, res, image) => {
  if (!image) return res.status(404).end();
  const etag = `"${crypto.createHash("sha1").update(image.data).digest("hex")}"`;
  res.set("ETag", etag);
  res.set("Cache-Control", "no-cache");
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  res.set("Content-Type", image.mime || "application/octet-stream");
  res.send(image.data);
};

// Throws instead of silently saving NaN or a negative number, which would either
// get stored as-is or hit Postgres's "invalid input syntax for type numeric" and
// surface as a generic 500. Blank means made-to-order (no fixed price).
const parsePrice = (raw) => {
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw badRequest("price must be a non-negative number, or blank for made-to-order");
  return n;
};

exports.getItem = asyncHandler(async (req, res) => {
  const item = await menuItems.getById(req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json({ item });
});

exports.getMenu = asyncHandler(async (req, res) => {
  const { category } = req.query;
  res.json({ items: await menuItems.getAll(category) });
});

exports.getImage = asyncHandler(async (req, res) => {
  sendImage(req, res, await menuItems.getImage(req.params.id));
});

// Same "blank means the sensible default" convention as price (blank price =
// made to order) — blank/0 prep time means "ready now", so the owner never
// has to type a 0.
const parseMinutes = (v) => (v === "" || v === undefined || v === null ? null : Number(v));

exports.createMenuItem = asyncHandler(async (req, res) => {
  const { name, category, price, unit, description, isVeg, spiceLevel, prepMinutes } = req.body;
  if (!name || !category || !unit) {
    return res.status(400).json({ error: "name, category and unit are required" });
  }
  const parsedPrice = parsePrice(price);
  const item = await menuItems.create({
    name,
    category,
    price: parsedPrice,
    unit,
    description,
    isVeg: isVeg === "false" ? false : isVeg,
    spiceLevel,
    prepMinutes: parseMinutes(prepMinutes),
    imageBuffer: req.file ? req.file.buffer : null,
    imageMime: req.file ? req.file.mimetype : null
  });
  res.status(201).json({ item });
});

exports.updateMenuItem = asyncHandler(async (req, res) => {
  const fields = { ...req.body };
  if (fields.price !== undefined) fields.price = parsePrice(fields.price);
  if (fields.prepMinutes !== undefined) fields.prepMinutes = parseMinutes(fields.prepMinutes);
  if (req.file) {
    fields.imageBuffer = req.file.buffer;
    fields.imageMime = req.file.mimetype;
  }
  const item = await menuItems.update(req.params.id, fields);
  if (!item) return res.status(404).json({ error: "Menu item not found" });
  res.json({ item });
});

exports.deleteMenuItem = asyncHandler(async (req, res) => {
  await menuItems.remove(req.params.id);
  res.status(204).end();
});

exports.setAvailability = asyncHandler(async (req, res) => {
  const { inStock } = req.body;
  const item = await menuItems.update(req.params.id, { inStock: !!inStock });
  if (!item) return res.status(404).json({ error: "Menu item not found" });
  res.json({ item });
});

// Today's Special — auto-expires at end of day so nobody has to remember to
// clear it manually. Toggling on sets special_until to tonight's midnight;
// toggling off clears both fields.
exports.setSpecial = asyncHandler(async (req, res) => {
  const { isSpecial } = req.body;
  if (typeof isSpecial !== "boolean") {
    return res.status(400).json({ error: "isSpecial must be a boolean" });
  }
  const specialUntil = isSpecial
    ? new Date(new Date().setHours(23, 59, 59, 999)).toISOString()
    : null;
  const item = await menuItems.update(req.params.id, { isSpecial, specialUntil });
  if (!item) return res.status(404).json({ error: "Menu item not found" });
  res.json({ item });
});

exports.setPopular = asyncHandler(async (req, res) => {
  const { isPopular } = req.body;
  if (typeof isPopular !== "boolean") {
    return res.status(400).json({ error: "isPopular must be a boolean" });
  }
  const item = await menuItems.update(req.params.id, { isPopular });
  if (!item) return res.status(404).json({ error: "Menu item not found" });
  res.json({ item });
});

exports.getRecipe = asyncHandler(async (req, res) => {
  const recipes = require("../data/recipes");
  res.json({ ingredients: await recipes.getForMenuItem(req.params.id) });
});

exports.setRecipe = asyncHandler(async (req, res) => {
  const recipes = require("../data/recipes");
  const { ingredients } = req.body;
  if (!Array.isArray(ingredients)) return res.status(400).json({ error: "ingredients must be an array" });
  await recipes.setForMenuItem(req.params.id, ingredients);
  res.json({ ingredients: await recipes.getForMenuItem(req.params.id) });
});

// --- gallery images (extra photos beyond the cover image) ---

exports.getGalleryImage = asyncHandler(async (req, res) => {
  sendImage(req, res, await menuItems.getGalleryImage(req.params.id, req.params.imageId));
});

exports.addGalleryImage = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "image is required" });
  const item = await menuItems.addGalleryImage(req.params.id, { data: req.file.buffer, mime: req.file.mimetype });
  if (!item) return res.status(404).json({ error: "Menu item not found" });
  res.status(201).json({ item });
});

exports.deleteGalleryImage = asyncHandler(async (req, res) => {
  const item = await menuItems.removeGalleryImage(req.params.id, req.params.imageId);
  if (!item) return res.status(404).json({ error: "Menu item or photo not found" });
  res.json({ item });
});
