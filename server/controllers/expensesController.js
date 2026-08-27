const pool = require("../config/db");
const asyncHandler = require("../middleware/asyncHandler");

exports.getExpenses = asyncHandler(async (req, res) => {
  const { rows } = await pool.query("select * from expenses order by incurred_at desc, id desc");
  res.json({
    expenses: rows.map((r) => ({
      id: r.id,
      description: r.description,
      amount: Number(r.amount),
      category: r.category,
      incurredAt: r.incurred_at
    }))
  });
});

exports.createExpense = asyncHandler(async (req, res) => {
  const { description, amount, category, incurredAt } = req.body;
  if (!description || amount === undefined) {
    return res.status(400).json({ error: "description and amount are required" });
  }
  const { rows } = await pool.query(
    `insert into expenses (description, amount, category, incurred_at, created_by)
     values ($1, $2, $3, coalesce($4, current_date), $5) returning *`,
    [description, amount, category || "other", incurredAt || null, req.user.id]
  );
  const r = rows[0];
  res.status(201).json({ expense: { id: r.id, description: r.description, amount: Number(r.amount), category: r.category, incurredAt: r.incurred_at } });
});

exports.deleteExpense = asyncHandler(async (req, res) => {
  await pool.query("delete from expenses where id = $1", [req.params.id]);
  res.status(204).end();
});
