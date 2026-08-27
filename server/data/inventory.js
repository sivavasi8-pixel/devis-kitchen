const pool = require("../config/db");

const statusFor = (item) => {
  if (item.quantity <= 0) return "out_of_stock";
  if (item.quantity <= item.reorderLevel) return "low_stock";
  return "in_stock";
};

const mapRow = (r) =>
  r && {
    id: r.id,
    name: r.name,
    unit: r.unit,
    quantity: Number(r.quantity),
    reorderLevel: Number(r.reorder_level),
    supplier: r.supplier
  };

const withStatus = (item) => item && { ...item, status: statusFor(item) };

exports.getAll = async () => {
  const { rows } = await pool.query("select * from inventory order by id");
  return rows.map(mapRow).map(withStatus);
};

exports.create = async ({ name, unit, quantity, reorderLevel, supplier }) => {
  const { rows } = await pool.query(
    `insert into inventory (name, unit, quantity, reorder_level, supplier)
     values ($1, $2, $3, $4, $5) returning *`,
    [name, unit, quantity || 0, reorderLevel || 0, supplier || null]
  );
  return withStatus(mapRow(rows[0]));
};

exports.update = async (id, fields) => {
  const setClauses = [];
  const values = [];
  let i = 1;
  const map = { name: "name", unit: "unit", quantity: "quantity", reorderLevel: "reorder_level", supplier: "supplier" };
  for (const [key, col] of Object.entries(map)) {
    if (fields[key] !== undefined) {
      setClauses.push(`${col} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (!setClauses.length) {
    const { rows } = await pool.query("select * from inventory where id = $1", [id]);
    return withStatus(mapRow(rows[0]));
  }
  values.push(id);
  const { rows } = await pool.query(`update inventory set ${setClauses.join(", ")} where id = $${i} returning *`, values);
  return withStatus(mapRow(rows[0]));
};

exports.remove = async (id) => {
  await pool.query("delete from inventory where id = $1", [id]);
};

// Deduct/restock helpers used by orderController — floored at zero, mirrors bakery app.
exports.deduct = async (id, amount) => {
  await pool.query("update inventory set quantity = greatest(0, quantity - $1) where id = $2", [amount, id]);
};

exports.restock = async (id, amount) => {
  await pool.query("update inventory set quantity = quantity + $1 where id = $2", [amount, id]);
};
