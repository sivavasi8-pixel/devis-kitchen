const orders = require("../data/orders");
const inventory = require("../data/inventory");
const staff = require("../data/staff");
const asyncHandler = require("../middleware/asyncHandler");

exports.getSummary = asyncHandler(async (req, res) => {
  // countActive/getRecent/getActive do the filtering in SQL instead of pulling the
  // full order history into Node on every dashboard refresh.
  const [recentOrders, pendingCount, active, unpaid, todaysOrders, inv, staffList] = await Promise.all([
    orders.getRecent(5),
    orders.countActive(),
    orders.getActive(),
    orders.unpaidTotals(),
    orders.getToday(),
    inventory.getAll(),
    staff.getAll()
  ]);

  // Cancelled orders never became sales, so they don't count toward revenue.
  const todaysSales = todaysOrders.filter((o) => o.status !== "cancelled");
  const todaysRevenue = todaysSales.reduce((sum, o) => sum + (o.total || 0), 0);

  const lowStock = inv.filter((i) => i.status === "low_stock" || i.status === "out_of_stock");
  const onShift = staffList.filter((s) => s.status === "clocked_in").length;

  // "What needs doing now": kitchen-side orders still in progress, oldest first so
  // the one that's been waiting longest is at the top.
  const inProgress = active.filter((o) => ["placed", "preparing", "ready"].includes(o.status));
  const queue = [...inProgress].sort((a, b) => a.id - b.id);
  const toCook = inProgress.filter((o) => o.status === "placed" || o.status === "preparing").length;

  res.json({
    todaysRevenue,
    ordersToday: todaysSales.length,
    pendingOrders: pendingCount,
    staffOnShift: onShift,
    staffTotal: staffList.length,
    lowStockCount: lowStock.length,
    lowStockItems: lowStock,
    recentOrders,
    queue: queue.slice(0, 8),
    activeCount: inProgress.length,
    toCook,
    awaitingPayment: unpaid,
    staff: staffList.map((s) => ({ id: s.id, name: s.name, role: s.role, shift: s.shift, status: s.status }))
  });
});
