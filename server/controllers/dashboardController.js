const pool = require("../config/db");
const asyncHandler = require("../middleware/asyncHandler");

// Response shape matches the reference bakery app's Dashboard.jsx exactly
// (todaysRevenue, ordersToday, pendingOrders, staffOnShift/staffTotal,
// lowStockCount/lowStockItems, recentOrders) plus riderName on each recent
// order, which the bakery has no equivalent for (pickup-only, no riders).
exports.getSummary = asyncHandler(async (req, res) => {
  const [todayRows, allOrdersRows, lowStockRows, staffRows] = await Promise.all([
    pool.query(
      `select coalesce(sum(total), 0) as revenue, count(*) as order_count
       from orders where created_at::date = current_date and status != 'cancelled'`
    ),
    pool.query(
      `select o.*, s.name as rider_name from orders o left join staff s on s.id = o.rider_id
       order by o.created_at desc`
    ),
    pool.query(`select * from inventory where quantity <= reorder_level`),
    pool.query(`select * from staff`)
  ]);

  const allOrders = allOrdersRows.rows;
  const pending = allOrders.filter((o) => !["delivered", "picked_up", "cancelled"].includes(o.status));
  const staffOnShift = staffRows.rows.filter((s) => s.status === "clocked_in").length;

  res.json({
    todaysRevenue: Number(todayRows.rows[0].revenue),
    ordersToday: Number(todayRows.rows[0].order_count),
    pendingOrders: pending.length,
    staffOnShift,
    staffTotal: staffRows.rows.length,
    lowStockCount: lowStockRows.rows.length,
    lowStockItems: lowStockRows.rows.map((r) => ({ id: r.id, name: r.name, quantity: Number(r.quantity), unit: r.unit })),
    recentOrders: allOrders.slice(0, 5).map((r) => ({
      id: r.id,
      customerName: r.customer_name,
      total: Number(r.total),
      status: r.status,
      channel: r.channel,
      items: r.items,
      pickupTime: r.channel === "dine_in" ? `Table ${r.table_number || "—"}` : r.delivery_address || "Pickup",
      paymentStatus: r.payment_status,
      paymentMethod: r.payment_method,
      riderName: r.rider_name
    }))
  });
});
