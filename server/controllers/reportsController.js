const orders = require("../data/orders");
const pool = require("../config/db");
const asyncHandler = require("../middleware/asyncHandler");

const dayKey = (date) => new Date(date).toISOString().slice(0, 10); // YYYY-MM-DD

// Response shape matches the reference bakery app's Reports.jsx exactly
// (last7Days/bestSellers/ordersByStatus/allTime*/recentExpenses) — reuses
// this app's own orders data layer + a direct expenses query since there's
// no separate expenses data module here.
exports.getSummary = asyncHandler(async (req, res) => {
  const [allOrders, expensesResult] = await Promise.all([
    orders.getAll(),
    pool.query("select * from expenses order by incurred_at desc, id desc")
  ]);
  const allExpenses = expensesResult.rows.map((r) => ({
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    category: r.category,
    incurredAt: r.incurred_at
  }));

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(dayKey(d));
  }
  const byDay = Object.fromEntries(days.map((d) => [d, { date: d, revenue: 0, orders: 0 }]));
  for (const o of allOrders) {
    if (o.status === "cancelled") continue;
    const key = dayKey(o.createdAt);
    if (byDay[key]) {
      byDay[key].revenue += o.total || 0;
      byDay[key].orders += 1;
    }
  }
  const last7Days = days.map((d) => byDay[d]);

  const itemTotals = new Map();
  for (const o of allOrders) {
    if (o.status === "cancelled") continue;
    for (const item of o.items || []) {
      const prev = itemTotals.get(item.name) || 0;
      itemTotals.set(item.name, prev + (item.qty || 1));
    }
  }
  const bestSellers = [...itemTotals.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const ordersByStatus = allOrders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const allTimeRevenue = allOrders.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + (o.total || 0), 0);
  const allTimeExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);

  const last7DaysSet = new Set(days);
  const expensesLast7Days = allExpenses
    .filter((e) => last7DaysSet.has(dayKey(e.incurredAt)))
    .reduce((sum, e) => sum + e.amount, 0);
  const revenueLast7Days = last7Days.reduce((sum, d) => sum + d.revenue, 0);

  res.json({
    last7Days,
    bestSellers,
    ordersByStatus,
    allTimeRevenue,
    allTimeOrders: allOrders.length,
    allTimeExpenses,
    allTimeProfit: allTimeRevenue - allTimeExpenses,
    revenueLast7Days,
    expensesLast7Days,
    profitLast7Days: revenueLast7Days - expensesLast7Days,
    recentExpenses: allExpenses.slice(0, 10)
  });
});
