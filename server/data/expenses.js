// Owner-logged expenses, backed by PostgreSQL — see server/db/schema.sql.
const pool = require("../config/db");

const mapRow = (row) =>
  row && {
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    category: row.category,
    incurredAt: row.incurred_at,
    createdBy: row.created_by
  };

module.exports = {
  getAll: async () => {
    const { rows } = await pool.query("select * from expenses order by incurred_at desc, id desc");
    return rows.map(mapRow);
  },
  create: async ({ description, amount, category, incurredAt, createdBy }) => {
    const { rows } = await pool.query(
      `insert into expenses (description, amount, category, incurred_at, created_by)
       values ($1, $2, $3, coalesce($4, current_date), $5) returning *`,
      [description, amount, category || "other", incurredAt || null, createdBy || null]
    );
    return mapRow(rows[0]);
  },
  remove: async (id) => {
    const { rowCount } = await pool.query("delete from expenses where id = $1", [Number(id)]);
    return rowCount > 0;
  }
};
