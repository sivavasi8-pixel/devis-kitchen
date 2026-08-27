const pool = require("../config/db");

const mapRow = (r) =>
  r && {
    id: r.id,
    name: r.name,
    cycle: r.cycle,
    mealSlots: r.meal_slots,
    maxItemsPerMeal: r.max_items_per_meal,
    isActive: r.is_active
  };

exports.getAll = async ({ activeOnly } = {}) => {
  const { rows } = await pool.query(
    activeOnly
      ? "select * from subscription_plans where is_active = true order by id"
      : "select * from subscription_plans order by id"
  );
  return rows.map(mapRow);
};

exports.getById = async (id) => {
  const { rows } = await pool.query("select * from subscription_plans where id = $1", [id]);
  return mapRow(rows[0]);
};

exports.create = async ({ name, cycle, mealSlots, maxItemsPerMeal }) => {
  const { rows } = await pool.query(
    `insert into subscription_plans (name, cycle, meal_slots, max_items_per_meal)
     values ($1, $2, $3, $4) returning *`,
    [name, cycle, mealSlots, maxItemsPerMeal || 2]
  );
  return mapRow(rows[0]);
};

exports.update = async (id, fields) => {
  const setClauses = [];
  const values = [];
  let i = 1;
  const map = { name: "name", cycle: "cycle", mealSlots: "meal_slots", maxItemsPerMeal: "max_items_per_meal", isActive: "is_active" };
  for (const [key, col] of Object.entries(map)) {
    if (fields[key] !== undefined) {
      setClauses.push(`${col} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (!setClauses.length) return exports.getById(id);
  values.push(id);
  const { rows } = await pool.query(`update subscription_plans set ${setClauses.join(", ")} where id = $${i} returning *`, values);
  return mapRow(rows[0]);
};

exports.remove = async (id) => {
  await pool.query("delete from subscription_plans where id = $1", [id]);
};
