const inventory = require("../data/inventory");
const asyncHandler = require("../middleware/asyncHandler");

exports.getInventory = asyncHandler(async (req, res) => {
  res.json({ items: await inventory.getAll() });
});

exports.createItem = asyncHandler(async (req, res) => {
  const { name, unit, quantity, reorderLevel, supplier } = req.body;
  if (!name || !unit) return res.status(400).json({ error: "name and unit are required" });
  const item = await inventory.create({ name, unit, quantity, reorderLevel, supplier });
  res.status(201).json({ item });
});

exports.updateItem = asyncHandler(async (req, res) => {
  const item = await inventory.update(req.params.id, req.body);
  res.json({ item });
});

exports.deleteItem = asyncHandler(async (req, res) => {
  await inventory.remove(req.params.id);
  res.status(204).end();
});
