const pool = require("../config/db");

// Ingredient BOM for a menu item, joined with the ingredient's name/unit for display.
exports.getForMenuItem = async (menuItemId) => {
  const { rows } = await pool.query(
    `select ri.inventory_id as "inventoryId", ri.qty_per_unit as "qtyPerUnit",
            inv.name as "ingredientName", inv.unit as "ingredientUnit"
     from recipe_ingredients ri
     join inventory inv on inv.id = ri.inventory_id
     where ri.menu_item_id = $1
     order by ri.id`,
    [menuItemId]
  );
  return rows.map((r) => ({ ...r, qtyPerUnit: Number(r.qtyPerUnit) }));
};

// Replace-all, wrapped in a transaction so a bad row can't leave the recipe half-written.
exports.setForMenuItem = async (menuItemId, ingredients) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from recipe_ingredients where menu_item_id = $1", [menuItemId]);
    for (const ing of ingredients) {
      await client.query(
        `insert into recipe_ingredients (menu_item_id, inventory_id, qty_per_unit) values ($1, $2, $3)`,
        [menuItemId, ing.inventoryId, ing.qtyPerUnit]
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
};
