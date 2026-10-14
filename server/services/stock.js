const inventory = require("../data/inventory");
const recipes = require("../data/recipes");

// Shared by order creation (deduct), cancellation (restock) in
// orderController.js, and subscription materialization (deduct) in
// subscriptionMaterializer.js — items need a menuItemId to match a recipe; a
// missing recipe or id is a silent no-op for that line.
//
// Per-kg lines (made-to-order items) scale the recipe by their size, so 2 kg of
// biryani uses twice the ingredients of 1 kg. `db` lets a caller run this inside
// its own transaction, and `orderId` is logged with each movement so inventory
// history can point back to the order that consumed or returned the stock.
exports.adjustStockForItems = async (items, direction, db, orderId) => {
  const adjust = direction === "deduct" ? inventory.deduct : inventory.restock;
  const reference = orderId ? String(orderId) : undefined;
  for (const item of items) {
    if (!item.menuItemId) continue;
    const multiplier = (item.qty || 1) * (item.size || 1);
    const ingredients = await recipes.getForMenuItem(item.menuItemId, db);
    for (const ing of ingredients) {
      await adjust(ing.inventoryId, ing.qtyPerUnit * multiplier, db, reference);
    }
  }
};
