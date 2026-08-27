const orders = require("../data/orders");
const inventory = require("../data/inventory");
const recipes = require("../data/recipes");
const asyncHandler = require("../middleware/asyncHandler");

const VALID_STATUSES = ["placed", "preparing", "ready", "out_for_delivery", "picked_up", "delivered", "cancelled"];
const TERMINAL_STATUSES = ["delivered", "picked_up", "cancelled"];

// Shared by order creation (deduct) and cancellation (restock) — items need a
// menuItemId to match a recipe; a missing recipe or id is a silent no-op for that line.
const adjustStockForItems = async (items, direction) => {
  const adjust = direction === "deduct" ? inventory.deduct : inventory.restock;
  for (const item of items) {
    if (!item.menuItemId) continue;
    const ingredients = await recipes.getForMenuItem(item.menuItemId);
    for (const ing of ingredients) {
      await adjust(ing.inventoryId, ing.qtyPerUnit * (item.qty || 1));
    }
  }
};

exports.getOrders = asyncHandler(async (req, res) => {
  const { status } = req.query;
  let list = await orders.getAll();
  if (status) list = list.filter((o) => o.status === status);
  res.json({ orders: list });
});

exports.getMyOrders = asyncHandler(async (req, res) => {
  res.json({ orders: await orders.getByCustomerId(req.user.id) });
});

// A rider's own assigned orders (ready/out_for_delivery first).
exports.getMyDeliveries = asyncHandler(async (req, res) => {
  if (!req.user.staffId) return res.json({ orders: [] });
  res.json({ orders: await orders.getByRiderId(req.user.staffId) });
});

// Orders that are ready to go out but have no rider yet — the pool any rider
// (or owner/staff, for manual assignment) can pull from.
exports.getUnassigned = asyncHandler(async (req, res) => {
  res.json({ orders: await orders.getUnassignedReady() });
});

exports.getOrder = asyncHandler(async (req, res) => {
  const order = await orders.getById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  // A customer can only ever look up their own order; owner/staff/rider can look up any.
  if (req.user.role === "customer" && order.customerId !== req.user.id) {
    return res.status(403).json({ error: "Not your order" });
  }
  res.json({ order });
});

exports.createOrder = asyncHandler(async (req, res) => {
  const { items, total, channel, paymentMethod, deliveryAddress, deliveryPhone, tableNumber, customerName } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ error: "items are required" });
  }
  const validChannels = ["delivery", "pickup", "dine_in"];
  const validPayment = ["cash", "upi", "card"];
  if (channel && !validChannels.includes(channel)) {
    return res.status(400).json({ error: `channel must be one of ${validChannels.join(", ")}` });
  }
  if (paymentMethod && !validPayment.includes(paymentMethod)) {
    return res.status(400).json({ error: `paymentMethod must be one of ${validPayment.join(", ")}` });
  }

  const resolvedChannel = channel || "delivery";
  if (resolvedChannel === "delivery" && !deliveryAddress) {
    return res.status(400).json({ error: "deliveryAddress is required for delivery orders" });
  }

  // A logged-in customer's identity always wins. Staff/owner hitting this same
  // endpoint from an in-store POS (pickup/dine-in) supply a walk-in name instead.
  const isCustomer = req.user.role === "customer";

  // No real payment gateway (out of scope) — simulate the two realistic outcomes:
  // a counter sale (pickup/dine-in rung up by staff) is paid on the spot regardless
  // of method; a customer's own order is only "paid" immediately for upi/card
  // (prepaid) — "cash" stays unpaid until staff marks it paid (on delivery/pickup).
  const paymentStatus = !isCustomer || (paymentMethod && paymentMethod !== "cash") ? "paid" : "unpaid";

  const order = await orders.create({
    customerName: isCustomer ? req.user.name : customerName || "Walk-in",
    customerId: isCustomer ? req.user.id : null,
    items,
    total,
    channel: resolvedChannel,
    paymentMethod: paymentMethod || "cash",
    paymentStatus,
    deliveryAddress: resolvedChannel === "delivery" ? deliveryAddress : null,
    deliveryPhone: resolvedChannel === "delivery" ? deliveryPhone : null,
    tableNumber: resolvedChannel === "dine_in" ? tableNumber : null
  });

  await adjustStockForItems(items, "deduct");

  res.status(201).json({ order });
});

exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` });
  }

  const existing = await orders.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Order not found" });

  // A rider may only move their own assigned orders, and only through the
  // delivery/pickup-handoff steps — not back to kitchen states.
  if (req.user.role === "rider") {
    if (existing.riderId !== req.user.staffId) {
      return res.status(403).json({ error: "This order isn't assigned to you" });
    }
    const riderAllowed = ["out_for_delivery", "picked_up", "delivered"];
    if (!riderAllowed.includes(status)) {
      return res.status(403).json({ error: `Riders can only set status to ${riderAllowed.join(", ")}` });
    }
  }

  const order = await orders.updateStatus(req.params.id, status);
  res.json({ order });
});

// Owner/staff assign a rider to a ready order; a rider can also self-claim
// from the unassigned pool by passing their own staffId.
exports.assignRider = asyncHandler(async (req, res) => {
  const { riderId } = req.body;
  if (!riderId) return res.status(400).json({ error: "riderId is required" });

  const order = await orders.getById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.channel === "dine_in") {
    return res.status(400).json({ error: "Dine-in orders don't need a rider" });
  }
  if (order.status !== "ready") {
    return res.status(400).json({ error: "Only 'ready' orders can be assigned to a rider" });
  }

  if (req.user.role === "rider" && Number(riderId) !== req.user.staffId) {
    return res.status(403).json({ error: "Riders can only assign orders to themselves" });
  }

  const updated = await orders.assignRider(req.params.id, riderId);
  res.json({ order: updated });
});

exports.cancelOrder = asyncHandler(async (req, res) => {
  const order = await orders.getById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (req.user.role === "customer") {
    if (order.customerId !== req.user.id) {
      return res.status(403).json({ error: "Not your order" });
    }
    // A customer can only back out before the kitchen has started on it.
    if (order.status !== "placed") {
      return res.status(400).json({ error: "This order is already being prepared — ask the restaurant to cancel it" });
    }
  }

  if (TERMINAL_STATUSES.includes(order.status)) {
    return res.status(400).json({ error: `Can't cancel an order that's already ${order.status}` });
  }

  const updated = await orders.updateStatus(req.params.id, "cancelled");
  await adjustStockForItems(order.items, "restock");
  res.json({ order: updated });
});

exports.updateOrderPayment = asyncHandler(async (req, res) => {
  const { paymentStatus } = req.body;
  if (!["unpaid", "paid"].includes(paymentStatus)) {
    return res.status(400).json({ error: "paymentStatus must be 'unpaid' or 'paid'" });
  }
  const order = await orders.updatePaymentStatus(req.params.id, paymentStatus);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ order });
});
