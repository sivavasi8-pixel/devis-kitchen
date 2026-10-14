// Ingredient stock levels, backed by PostgreSQL — see server/db/schema.sql.
const pool = require("../config/db");

const statusFor = (item) => {
  if (item.quantity <= 0) return "out_of_stock";
  if (item.quantity <= item.reorderLevel) return "low_stock";
  return "in_stock";
};

const mapRow = (row) =>
  row && {
    id: row.id,
    name: row.name,
    unit: row.unit,
    quantity: Number(row.quantity),
    reorderLevel: Number(row.reorder_level),
    supplier: row.supplier,
    costPerUnit: row.cost_per_unit === null || row.cost_per_unit === undefined ? null : Number(row.cost_per_unit),
    // Only present on rows from getAll() (a join against inventory_movements) —
    // undefined elsewhere, so callers that don't ask for it don't pay for it.
    used7d: row.used_7d === undefined ? undefined : Number(row.used_7d),
    used30d: row.used_30d === undefined ? undefined : Number(row.used_30d)
  };

const withStatus = (item) => item && { ...item, status: statusFor(item) };

// Every write that changes `quantity` logs why, on the same connection/transaction
// as the quantity update itself — so a movement row and its quantity change are
// never out of sync, and an order's deduct rows can't outlive a rolled-back order.
const logMovement = (db, inventoryId, change, reason, reference) =>
  db.query(
    "insert into inventory_movements (inventory_id, change, reason, reference) values ($1, $2, $3, $4)",
    [Number(inventoryId), change, reason, reference ?? null]
  );

module.exports = {
  // Joins each item's last 7/30 days of order-driven consumption — cheap at this
  // scale (a handful of ingredients) and saves every caller of the Inventory page
  // a second round trip just to show "used this week".
  getAll: async () => {
    const { rows } = await pool.query(`
      select i.*,
        coalesce((
          select -sum(m.change) from inventory_movements m
          where m.inventory_id = i.id and m.reason = 'order_deduct' and m.created_at >= now() - interval '7 days'
        ), 0) as used_7d,
        coalesce((
          select -sum(m.change) from inventory_movements m
          where m.inventory_id = i.id and m.reason = 'order_deduct' and m.created_at >= now() - interval '30 days'
        ), 0) as used_30d
      from inventory i
      order by i.id
    `);
    return rows.map(mapRow).map(withStatus);
  },
  getById: async (id) => {
    const { rows } = await pool.query("select * from inventory where id = $1", [Number(id)]);
    return withStatus(mapRow(rows[0]));
  },
  // Recent history for one ingredient — what the Inventory page's "History" panel shows.
  getMovements: async (id, limit = 30) => {
    const { rows } = await pool.query(
      "select id, change, reason, reference, created_at from inventory_movements where inventory_id = $1 order by created_at desc limit $2",
      [Number(id), limit]
    );
    return rows.map((r) => ({
      id: r.id,
      change: Number(r.change),
      reason: r.reason,
      reference: r.reference,
      createdAt: r.created_at
    }));
  },
  // Total ingredient cost actually consumed by real orders (order_deduct movements
  // only — a manual correction isn't "spend") in the last N days, across every
  // ingredient that has a cost_per_unit set. Items with no cost on file are simply
  // left out of the total rather than treated as free.
  getIngredientCostSince: async (days) => {
    const { rows } = await pool.query(
      `select coalesce(sum(-m.change * i.cost_per_unit), 0) as cost
       from inventory_movements m
       join inventory i on i.id = m.inventory_id
       where m.reason = 'order_deduct' and i.cost_per_unit is not null
         and m.created_at >= now() - interval '1 day' * $1`,
      [days]
    );
    return Number(rows[0].cost);
  },
  create: async ({ name, unit, quantity, reorderLevel, supplier, costPerUnit }) => {
    const { rows } = await pool.query(
      `insert into inventory (name, unit, quantity, reorder_level, supplier, cost_per_unit)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [name, unit, quantity || 0, reorderLevel || 0, supplier || null, costPerUnit ?? null]
    );
    return withStatus(mapRow(rows[0]));
  },
  // Partial update — any omitted field keeps its current value. A quantity change
  // here (part of a broader catalog edit, not the quick "Set" action) is logged as
  // 'manual_adjust' rather than 'manual_set', so the history can tell the two apart.
  // `reason` lets the controller tell apart the quick "Set" action on the
  // Inventory list (quantity is the only field sent — 'manual_set') from a
  // quantity change that's part of a broader catalog edit ('manual_adjust',
  // the default) — same underlying write either way, just a clearer history.
  update: async (id, { name, unit, quantity, reorderLevel, supplier, costPerUnit }, reason = "manual_adjust") => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      let delta = 0;
      if (quantity != null) {
        const before = await client.query("select quantity from inventory where id = $1 for update", [Number(id)]);
        if (before.rows[0]) delta = Number(quantity) - Number(before.rows[0].quantity);
      }
      const { rows } = await client.query(
        `update inventory set
           name = coalesce($1, name),
           unit = coalesce($2, unit),
           quantity = coalesce($3, quantity),
           reorder_level = coalesce($4, reorder_level),
           supplier = coalesce($5, supplier),
           cost_per_unit = coalesce($6, cost_per_unit)
         where id = $7 returning *`,
        [name ?? null, unit ?? null, quantity ?? null, reorderLevel ?? null, supplier ?? null, costPerUnit ?? null, Number(id)]
      );
      if (rows[0] && delta !== 0) await logMovement(client, id, delta, reason);
      await client.query("commit");
      return withStatus(mapRow(rows[0]));
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  },
  // Cascades to recipe_ingredients and inventory_movements (see schema.sql) —
  // removing an ingredient in use silently drops it from any recipe that
  // referenced it, and its history goes with it.
  remove: async (id) => {
    const { rowCount } = await pool.query("delete from inventory where id = $1", [Number(id)]);
    return rowCount > 0;
  },
  // Relative decrement (vs. updateQuantity's absolute set) — used by recipe
  // auto-deduct on order creation. Floors at 0 rather than going negative; a
  // recipe outpacing real stock shows as "out of stock" rather than a confusing
  // negative number. `amount` is rounded before it ever reaches SQL — the caller
  // computes it as qtyPerUnit * quantity in plain JS floating point, which can
  // otherwise leave a value like 29.2699999999999994 sitting in a numeric column.
  deduct: async (id, amount, db = pool, reference) => {
    const clean = Math.round(amount * 1e6) / 1e6;
    const { rows } = await db.query(
      "update inventory set quantity = greatest(quantity - $1, 0) where id = $2 returning *",
      [clean, Number(id)]
    );
    await logMovement(db, id, -clean, "order_deduct", reference);
    return withStatus(mapRow(rows[0]));
  },
  // Counterpart to deduct — used when an order is cancelled, to give back the stock
  // its recipe took. Not a perfect inverse (if the recipe changed since the order was
  // placed, this restocks at *today's* recipe, not the one used at order time), but
  // right for the common case and far better than stock never coming back at all.
  restock: async (id, amount, db = pool, reference) => {
    const clean = Math.round(amount * 1e6) / 1e6;
    const { rows } = await db.query("update inventory set quantity = quantity + $1 where id = $2 returning *", [
      clean,
      Number(id)
    ]);
    await logMovement(db, id, clean, "order_restock", reference);
    return withStatus(mapRow(rows[0]));
  }
};
