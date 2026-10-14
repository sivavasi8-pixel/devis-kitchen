const inventory = require("../data/inventory");
const asyncHandler = require("../middleware/asyncHandler");

exports.getInventory = asyncHandler(async (req, res) => {
  res.json({ items: await inventory.getAll() });
});

exports.getItem = asyncHandler(async (req, res) => {
  const item = await inventory.getById(req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json({ item });
});

exports.getMovements = asyncHandler(async (req, res) => {
  res.json({ movements: await inventory.getMovements(req.params.id) });
});

exports.createItem = asyncHandler(async (req, res) => {
  const { name, unit, quantity, reorderLevel, supplier, costPerUnit } = req.body;
  if (!name || !unit) {
    return res.status(400).json({ error: "name and unit are required" });
  }
  const item = await inventory.create({ name, unit, quantity, reorderLevel, supplier, costPerUnit });
  res.status(201).json({ item });
});

// Accepts any subset of fields — a quantity-only PATCH (e.g. a quick restock) still works,
// same contract this endpoint had before it grew name/unit/reorderLevel/supplier editing.
exports.updateItem = asyncHandler(async (req, res) => {
  const { name, unit, quantity, reorderLevel, supplier, costPerUnit } = req.body;
  // Staff can restock (change the quantity); renaming an ingredient, changing its unit,
  // reorder level, cost or supplier is a catalog decision for the owner.
  if (req.user.role === "staff" && [name, unit, reorderLevel, supplier, costPerUnit].some((v) => v !== undefined)) {
    return res.status(403).json({ error: "Staff can update quantities only — ask the owner to edit ingredient details" });
  }
  if (quantity != null && (typeof quantity !== "number" || quantity < 0)) {
    return res.status(400).json({ error: "quantity must be a non-negative number" });
  }
  // The Inventory list's quick "Set" action sends only { quantity } — everything
  // else sent alongside it means this is part of a fuller catalog edit instead.
  const isQuickSet = quantity !== undefined && [name, unit, reorderLevel, supplier, costPerUnit].every((v) => v === undefined);
  const item = await inventory.update(
    req.params.id,
    { name, unit, quantity, reorderLevel, supplier, costPerUnit },
    isQuickSet ? "manual_set" : "manual_adjust"
  );
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json({ item });
});

exports.deleteItem = asyncHandler(async (req, res) => {
  const ok = await inventory.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: "Item not found" });
  res.status(204).end();
});
