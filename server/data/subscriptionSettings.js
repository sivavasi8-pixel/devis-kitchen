const pool = require("../config/db");

// discount_percent per cycle length — one shared table, applied to every plan
// of that cycle (see server/db/schema.sql for why: no per-plan override in v1).
exports.getDiscounts = async () => {
  const { rows } = await pool.query("select cycle, discount_percent from subscription_discounts order by cycle");
  const map = {};
  rows.forEach((r) => { map[r.cycle] = Number(r.discount_percent); });
  return map;
};

exports.updateDiscount = async (cycle, discountPercent) => {
  await pool.query(
    `insert into subscription_discounts (cycle, discount_percent) values ($1, $2)
     on conflict (cycle) do update set discount_percent = excluded.discount_percent`,
    [cycle, discountPercent]
  );
  return exports.getDiscounts();
};

exports.getDeliveryFeePerDay = async () => {
  const { rows } = await pool.query("select delivery_fee_per_day from subscription_settings where id = 1");
  return rows[0] ? Number(rows[0].delivery_fee_per_day) : 0;
};

exports.updateDeliveryFeePerDay = async (fee) => {
  await pool.query(
    `insert into subscription_settings (id, delivery_fee_per_day) values (1, $1)
     on conflict (id) do update set delivery_fee_per_day = excluded.delivery_fee_per_day`,
    [fee]
  );
  return fee;
};
