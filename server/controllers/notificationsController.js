const pool = require("../config/db");
const asyncHandler = require("../middleware/asyncHandler");

// Live, computed-on-request alerts — no persisted log/read state. Response
// shape ({ count, items: [{id, type, severity, title, detail}] }) matches
// the reference bakery app's NotificationBell contract, extended with a
// rider branch (the bakery has no delivery role to notify).
exports.getNotifications = asyncHandler(async (req, res) => {
  if (req.user.role === "customer") {
    const { rows } = await pool.query(
      `select id, status, channel, delivery_address, table_number from orders
       where customer_id = $1 and status not in ('delivered', 'picked_up', 'cancelled')`,
      [req.user.id]
    );
    const items = rows.map((o) => ({
      id: `order-${o.id}`,
      type: "my_order",
      severity: o.status === "ready" ? "warning" : "info",
      title: `Order #${o.id} is ${o.status.replace(/_/g, " ")}`,
      detail:
        o.status === "ready"
          ? o.channel === "delivery"
            ? "Your rider will be assigned shortly!"
            : "Ready for pickup!"
          : o.channel === "dine_in"
          ? `Table ${o.table_number || "—"}`
          : o.channel === "delivery"
          ? `Delivering to: ${o.delivery_address || "—"}`
          : "Pickup order"
    }));
    return res.json({ count: items.length, items });
  }

  if (req.user.role === "rider" && req.user.staffId) {
    const { rows } = await pool.query(
      `select id, status from orders where rider_id = $1 and status in ('ready', 'out_for_delivery')`,
      [req.user.staffId]
    );
    const items = rows.map((o) => ({
      id: `order-${o.id}`,
      type: "my_delivery",
      severity: "warning",
      title: `Order #${o.id} is ${o.status.replace(/_/g, " ")}`,
      detail: o.status === "ready" ? "Ready for pickup/handoff" : "On the way"
    }));
    return res.json({ count: items.length, items });
  }

  // owner/staff
  const [allOrdersRows, lowStockRows, unassignedRows] = await Promise.all([
    pool.query(`select id, status, customer_name, items from orders where status not in ('delivered', 'picked_up', 'cancelled')`),
    pool.query(`select * from inventory where quantity <= reorder_level`),
    pool.query(
      `select id from orders where status = 'ready' and channel in ('delivery','pickup') and rider_id is null`
    )
  ]);

  const pending = allOrdersRows.rows;
  const lowStock = lowStockRows.rows;
  const unassigned = unassignedRows.rows;

  const items = [
    ...lowStock.map((i) => ({
      id: `stock-${i.id}`,
      type: "low_stock",
      severity: Number(i.quantity) <= 0 ? "critical" : "warning",
      title: `${i.name} is ${Number(i.quantity) <= 0 ? "out of stock" : "running low"}`,
      detail: `${i.quantity} ${i.unit} left · reorder at ${i.reorder_level}`
    })),
    ...unassigned.map((o) => ({
      id: `unassigned-${o.id}`,
      type: "unassigned_delivery",
      severity: "warning",
      title: `Order #${o.id} needs a rider`,
      detail: "Ready and waiting for pickup/dispatch"
    })),
    ...pending.slice(0, 8).map((o) => ({
      id: `order-${o.id}`,
      type: "order_pending",
      severity: "info",
      title: `Order #${o.id} — ${o.status}`,
      detail: `${o.customer_name} · ${(o.items || []).map((it) => it.name).join(", ")}`
    }))
  ];

  res.json({ count: lowStock.length + pending.length, items });
});
