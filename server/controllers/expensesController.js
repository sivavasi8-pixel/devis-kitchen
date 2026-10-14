const expenses = require("../data/expenses");
const asyncHandler = require("../middleware/asyncHandler");

exports.getExpenses = asyncHandler(async (req, res) => {
  res.json({ expenses: await expenses.getAll() });
});

exports.createExpense = asyncHandler(async (req, res) => {
  const { description, amount, category, incurredAt } = req.body;
  if (!description || typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ error: "description and a positive amount are required" });
  }
  const expense = await expenses.create({ description, amount, category, incurredAt, createdBy: req.user.id });
  res.status(201).json({ expense });
});

exports.deleteExpense = asyncHandler(async (req, res) => {
  const ok = await expenses.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: "Expense not found" });
  res.status(204).end();
});
