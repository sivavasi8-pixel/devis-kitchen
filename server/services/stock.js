const inventory = require("../data/inventory");
const recipes = require("../data/recipes");

// Shared by order creation (deduct), cancellation (restock) in
// orderController.js, and subscription materialization (deduct) in
// subscriptionMaterializer.js — items need a menuItemId to match a recipe; a
// missing recipe or id is a silent no-op for that line.
exports.adjustStockForItems = async (items, direction) => {
  const adjust = direction === "deduct" ? inventory.deduct : inventory.restock;
  for (const item of items) {
    if (!item.menuItemId) continue;
    const ingredients = await recipes.getForMenuItem(item.menuItemId);
    for (const ing of ingredients) {
      await adjust(ing.inventoryId, ing.qtyPerUnit * (item.qty || 1));
    }
  }
};
