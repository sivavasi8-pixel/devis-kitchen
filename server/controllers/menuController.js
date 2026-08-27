const menuItems = require("../data/menuItems");
const asyncHandler = require("../middleware/asyncHandler");

exports.getMenu = asyncHandler(async (req, res) => {
  const { category } = req.query;
  res.json({ items: await menuItems.getAll(category) });
});

exports.getImage = asyncHandler(async (req, res) => {
  const img = await menuItems.getImage(req.params.id);
  if (!img) return res.status(404).end();
  res.set("Content-Type", img.mime);
  res.send(img.data);
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
  const parsedPrice = price === "" || price === undefined || price === null ? null : Number(price);
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
  if (fields.price === "") fields.price = null;
  else if (fields.price !== undefined) fields.price = Number(fields.price);
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
  const img = await menuItems.getGalleryImage(req.params.id, req.params.imageId);
  if (!img) return res.status(404).end();
  res.set("Content-Type", img.mime || "application/octet-stream");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(img.data);
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
