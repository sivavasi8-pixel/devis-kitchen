const orders = require("../data/orders");
const menuItems = require("../data/menuItems");
const push = require("../services/push");
const geocode = require("../services/geocode");
const { haversineKm } = require("../services/distance");
const { getStoreLocation } = require("../config/storeLocation");
const { withTransaction } = require("../config/transaction");
const { adjustStockForItems } = require("../services/stock");
const ordering = require("../services/ordering");
const asyncHandler = require("../middleware/asyncHandler");

const VALID_STATUSES = ["placed", "preparing", "ready", "out_for_delivery", "picked_up", "delivered", "cancelled"];
const TERMINAL_STATUSES = ["delivered", "picked_up", "cancelled"];

const itemsLabel = (items) => (items || []).map((it) => `${it.name}${it.qty > 1 ? ` x${it.qty}` : ""}`).join(", ");

// A 400 that the central error handler passes through with its message.
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const notFound = (message) => Object.assign(new Error(message), { status: 404 });
const clip = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : undefined);

const MAX_QTY_PER_LINE = 100;
const MIN_CUSTOM_KG = 0.5;
const MAX_CUSTOM_KG = 50;

// "Ready" reads differently depending on how the order's leaving — pulled
// from the same wording notificationsController.js already uses for the bell,
// so the push and the bell never say two different things about one order.
const readyBody = (order) => {
  if (order.channel === "delivery") return "Waiting for a rider — won't be long.";
  if (order.channel === "dine_in") return `Coming right up to Table ${order.tableNumber || "—"}.`;
  return "Ready for pickup — swing by anytime.";
};

// Turns the cart the browser sent into trusted order lines. Only the menu item id,
// quantity, made-to-order size and note are taken from the request — name, price and
// availability always come from the database, so a tampered request can't set its
// own price or order something that's sold out.
const priceItems = async (rawItems, db) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw badRequest("items are required");
  if (rawItems.length > 50) throw badRequest("Too many lines in one order");

  const ids = rawItems.map((i) => Number(i && i.menuItemId));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw badRequest("Every item needs a valid menuItemId");
  }
  const menu = new Map((await menuItems.getForPricing([...new Set(ids)], db)).map((m) => [m.id, m]));

  let total = 0;
  const lines = rawItems.map((raw, idx) => {
    const item = menu.get(ids[idx]);
    if (!item) throw badRequest("An item in your cart is no longer on the menu — please refresh");
    if (!item.inStock) throw badRequest(`${item.name} is sold out right now`);
    if (item.price === null) throw badRequest(`${item.name} is priced on request — please call the restaurant`);

    const qty = raw.qty === undefined ? 1 : Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw badRequest(`Quantity for ${item.name} must be between 1 and ${MAX_QTY_PER_LINE}`);
    }

    const line = { menuItemId: item.id, name: item.name, qty };

    // Made-to-order items ("Biryani by the kg") are priced by weight: the menu's
    // per-kg rate × kg chosen. Keyed on the "custom" category, not the free-text
    // unit, so an ordinary item the owner lists "per kg" still sells as one unit.
    if (item.category === "custom") {
      const size = raw.size === undefined ? 1 : Number(raw.size);
      if (!Number.isFinite(size) || size < MIN_CUSTOM_KG || size > MAX_CUSTOM_KG) {
        throw badRequest(`Choose a quantity between ${MIN_CUSTOM_KG} and ${MAX_CUSTOM_KG} kg for ${item.name}`);
      }
      line.size = size;
      line.price = Math.round(item.price * size);
      // Keep the customer's description (e.g. "Biryani by the kg — 2kg, Chicken") for the kitchen.
      line.name = clip(raw.name, 120) || `${item.name} — ${size}kg`;
    } else {
      line.price = item.price;
    }

    const note = clip(raw.note, 300);
    if (note) line.note = note;

    total += line.price * qty;
    return line;
  });

  return { lines, total };
};

// Straight-line distance from the shop, and which other waiting orders are close
// together — a cheap "worth combining these runs" hint for riders without real
// route planning. Only known when the order itself has coordinates.
const NEARBY_KM = 1;
const withDelivery = (list, store) => {
  const out = list.map((o) => ({
    ...o,
    distanceFromStoreKm:
      o.deliveryLat != null && o.deliveryLng != null
        ? Math.round(haversineKm(store.lat, store.lng, o.deliveryLat, o.deliveryLng) * 10) / 10
        : null
  }));
  for (const o of out) {
    o.nearbyOrderIds =
      o.deliveryLat == null || o.deliveryLng == null
        ? []
        : out
            .filter(
              (other) =>
                other.id !== o.id &&
                other.deliveryLat != null &&
                other.deliveryLng != null &&
                haversineKm(o.deliveryLat, o.deliveryLng, other.deliveryLat, other.deliveryLng) <= NEARBY_KM
            )
            .map((other) => other.id);
  }
  return out;
};

// Owner/staff-flagged urgent orders first, then closest to the shop within each tier.
const byPriorityThenDistance = (a, b) => {
  if (a.priority !== b.priority) return a.priority ? -1 : 1;
  if (a.distanceFromStoreKm == null && b.distanceFromStoreKm == null) return a.id - b.id;
  if (a.distanceFromStoreKm == null) return 1; // unknown distance sorts last
  if (b.distanceFromStoreKm == null) return -1;
  return a.distanceFromStoreKm - b.distanceFromStoreKm || a.id - b.id;
};

// Public (no auth): lets the Order page show opening hours, bookable days/slots and the
// delivery zones before anyone logs in.
exports.getStoreStatus = asyncHandler(async (req, res) => {
  const config = await ordering.getConfig();
  res.json({
    openNow: ordering.isOpenNow(config),
    open: config.open,
    close: config.close,
    days: ordering.upcomingDays(config),
    zones: config.zones
  });
});

// Prices a cart and returns the delivery fee for a drop point, so checkout can show the
// real total before the customer commits. Same rules createOrder enforces.
exports.quoteOrder = asyncHandler(async (req, res) => {
  const { items, channel, deliveryLat, deliveryLng } = req.body;
  const { total } = await priceItems(items, undefined);
  let delivery = { zone: null, km: null, fee: 0, minOrder: 0 };
  let estimated = false;
  if (channel === "delivery") {
    const lat = deliveryLat === null || deliveryLat === undefined ? null : Number(deliveryLat);
    const lng = deliveryLng === null || deliveryLng === undefined ? null : Number(deliveryLng);
    const located = Number.isFinite(lat) && Number.isFinite(lng);
    estimated = !located;
    delivery = await ordering.quoteDelivery(await ordering.getConfig(), {
      lat: located ? lat : null,
      lng: located ? lng : null,
      itemsTotal: total
    });
  }
  res.json({ itemsTotal: total, deliveryFee: delivery.fee, deliveryZone: delivery.zone, distanceKm: delivery.km, total: total + delivery.fee, estimated });
});

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
  const store = await getStoreLocation();
  res.json({ orders: withDelivery(await orders.getByRiderId(req.user.staffId), store) });
});

// Orders that are ready to go out but have no rider yet — the pool any rider
// (or owner/staff, for manual assignment) can pull from. Priority first, then nearest.
exports.getUnassigned = asyncHandler(async (req, res) => {
  const store = await getStoreLocation();
  const list = withDelivery(await orders.getUnassignedReady(), store).sort(byPriorityThenDistance);
  res.json({ orders: list });
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

// A customer uploads proof of payment for their own order (a UPI/bank screenshot) —
// owner/staff review it, from the admin Orders page, before marking the order paid.
// Doesn't touch payment_status itself: "Mark paid" stays the one action that does.
exports.uploadReceipt = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A receipt image is required" });
  const order = await orders.getById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (req.user.role === "customer" && order.customerId !== req.user.id) {
    return res.status(403).json({ error: "Not your order" });
  }
  if (order.paymentStatus === "paid") {
    return res.status(400).json({ error: "This order is already marked paid" });
  }
  const updated = await orders.setReceipt(req.params.id, req.file.buffer, req.file.mimetype);
  res.json({ order: updated });
});

// Serves the uploaded receipt image itself — scoped to the order's own
// customer or any owner/staff reviewing it.
exports.getReceipt = asyncHandler(async (req, res) => {
  const order = await orders.getById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (req.user.role === "customer" && order.customerId !== req.user.id) {
    return res.status(403).json({ error: "Not your order" });
  }
  const receipt = await orders.getReceiptImage(req.params.id);
  if (!receipt) return res.status(404).end();
  res.set("Content-Type", receipt.mime || "application/octet-stream");
  res.set("Cache-Control", "no-cache");
  res.send(receipt.data);
});

exports.createOrder = asyncHandler(async (req, res) => {
  const { items, channel, paymentMethod, deliveryAddress, deliveryPhone, deliveryLat, deliveryLng, tableNumber, customerName, scheduleDate, scheduleSlot } =
    req.body;
  if (!Array.isArray(items) || !items.length) {
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
  const address = clip(deliveryAddress, 500);
  if (resolvedChannel === "delivery" && !address) {
    return res.status(400).json({ error: "deliveryAddress is required for delivery orders" });
  }

  // A logged-in customer's identity always wins. Staff/owner hitting this same
  // endpoint from an in-store POS (pickup/dine-in) supply a walk-in name instead.
  const isCustomer = req.user.role === "customer";

  // Set when the customer used "use my current location" / a map pin or a saved
  // address that has coordinates. Number(null) is 0 (finite!), so null/undefined
  // must be checked explicitly — coercing first would silently turn "no
  // location" into "exactly at 0,0".
  let lat = deliveryLat === null || deliveryLat === undefined ? null : Number(deliveryLat);
  let lng = deliveryLng === null || deliveryLng === undefined ? null : Number(deliveryLng);
  if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
    lat = null;
    lng = null;
  }
  // A typed address with no coordinates gets a best-effort forward-geocode so
  // distance-from-shop still works for riders. Done outside the transaction — it's
  // a network call (capped at 4s, swallowed on error), and must never hold a DB
  // transaction open or block the order itself.
  if (resolvedChannel === "delivery" && lat === null && lng === null && address) {
    const geo = await geocode.forwardGeocode(address);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    }
  }

  const isDelivery = resolvedChannel === "delivery";
  const config = await ordering.getConfig();

  const order = await withTransaction(async (db) => {
    const { lines, total: itemsTotal } = await priceItems(items, db);

    // Online delivery/pickup orders either book a day and time slot or go ahead "as soon
    // as possible" (only while we're open). Counter sales and dine-in skip scheduling.
    const wantsSchedule = isCustomer && resolvedChannel !== "dine_in";
    const schedule = wantsSchedule ? ordering.resolveSchedule(config, { date: scheduleDate, slot: scheduleSlot }) : null;

    // The delivery fee comes from the zone the drop point falls in, never from the browser.
    const delivery = isDelivery ? await ordering.quoteDelivery(config, { lat, lng, itemsTotal }) : null;
    const total = itemsTotal + (delivery ? delivery.fee : 0);

    // There's no payment gateway, so nothing online can be confirmed as paid
    // automatically. A counter sale (rung up by staff/owner) is paid on the spot;
    // every customer order — UPI and card included — starts "unpaid" until staff
    // check the money actually arrived and hit "Mark paid".
    const paymentStatus = isCustomer ? "unpaid" : "paid";

    const created = await orders.create(
      {
        customerName: isCustomer ? req.user.name : clip(customerName, 80) || "Walk-in",
        customerId: isCustomer ? req.user.id : null,
        items: lines,
        total,
        channel: resolvedChannel,
        paymentMethod: paymentMethod || "cash",
        paymentStatus,
        deliveryAddress: isDelivery ? address : null,
        deliveryPhone: isDelivery ? clip(deliveryPhone, 20) || null : null,
        deliveryLat: isDelivery ? lat : null,
        deliveryLng: isDelivery ? lng : null,
        deliveryFee: delivery ? delivery.fee : null,
        deliveryZone: delivery ? delivery.zone : null,
        scheduledDate: schedule ? schedule.date : null,
        scheduledSlot: schedule ? schedule.slot : null,
        tableNumber: resolvedChannel === "dine_in" ? clip(tableNumber, 20) : null
      },
      db
    );

    await adjustStockForItems(lines, "deduct", db, created.id);
    return created;
  });

  // Owner + every staff device — except the staff member who rang this up
  // themselves at POS, who doesn't need telling about their own sale.
  push.notifyRolesExcludingUser(["owner", "staff"], req.user.id, {
    title: `New order #${order.id}`,
    body: `${order.customerName} — ${itemsLabel(order.items)} — ₹${order.total} · ${order.channel.replace("_", "-")}`,
    data: { orderId: String(order.id) }
  });

  res.status(201).json({ order });
});

// Cancels inside one transaction (lock the order, flip status, give the stock back),
// so a double-click or two staff cancelling at once can't restock twice.
const cancelWithRestock = (orderId, user) =>
  withTransaction(async (db) => {
    const order = await orders.getById(orderId, db, { forUpdate: true });
    if (!order) throw notFound("Order not found");

    if (user.role === "customer") {
      if (order.customerId !== user.id) throw Object.assign(new Error("Not your order"), { status: 403 });
      // A customer can only back out before the kitchen has started on it.
      if (order.status !== "placed") {
        throw badRequest("This order is already being prepared — ask the restaurant to cancel it");
      }
    }
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw badRequest(`Can't cancel an order that's already ${order.status}`);
    }

    const updated = await orders.updateStatus(orderId, "cancelled", db);
    await adjustStockForItems(order.items, "restock", db, orderId);

    // Whichever side didn't do the cancelling is the side that needs telling —
    // a customer backing out needs the kitchen to stop; the kitchen/owner
    // cancelling needs the customer to know not to expect it.
    if (user.role === "customer") {
      push.notifyRolesExcludingUser(["owner", "staff"], user.id, {
        title: "Order cancelled",
        body: `${order.customerName} cancelled order #${order.id}.`,
        data: { orderId: String(order.id) }
      });
    } else if (order.customerId) {
      push.notifyUsers([order.customerId], {
        title: "Order cancelled",
        body: `Order #${order.id} was cancelled.`,
        data: { orderId: String(order.id) }
      });
    }

    return updated;
  });

exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` });
  }

  // A rider may only move their own assigned orders, and only through the
  // delivery/pickup-handoff steps — not back to kitchen states.
  if (req.user.role === "rider") {
    const existing = await orders.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Order not found" });
    if (existing.riderId !== req.user.staffId) {
      return res.status(403).json({ error: "This order isn't assigned to you" });
    }
    const riderAllowed = ["out_for_delivery", "picked_up", "delivered"];
    if (!riderAllowed.includes(status)) {
      return res.status(403).json({ error: `Riders can only set status to ${riderAllowed.join(", ")}` });
    }
  }

  // Cancelling always goes through the same path as the Cancel button, so stock is
  // returned no matter which screen or request did it.
  if (status === "cancelled") {
    return res.json({ order: await cancelWithRestock(req.params.id, req.user) });
  }

  const order = await withTransaction(async (db) => {
    const current = await orders.getById(req.params.id, db, { forUpdate: true });
    if (!current) throw notFound("Order not found");
    // A cancelled order has already had its stock returned — reopening it would
    // cook without deducting again. Staff should place a fresh order instead.
    if (current.status === "cancelled") {
      throw badRequest("A cancelled order can't be reopened — place a new order instead");
    }
    return orders.updateStatus(req.params.id, status, db);
  });

  notifyStatusChange(order, status);
  res.json({ order });
});

// One place for every "status changed" push — updateOrderStatus (kitchen/
// rider moving an order forward) ends up here; cancellation's own two-way
// notify needs to know who initiated it and so lives in cancelWithRestock.
function notifyStatusChange(order, status) {
  if (status === "preparing") {
    if (!order.customerId) return;
    push.notifyUsers([order.customerId], {
      title: "Your order's been accepted!",
      body: `Devi's Kitchen is preparing order #${order.id} now.`,
      data: { orderId: String(order.id) }
    });
    return;
  }

  if (status === "ready") {
    if (order.customerId) {
      push.notifyUsers([order.customerId], {
        title: "Order ready",
        body: readyBody(order),
        data: { orderId: String(order.id) }
      });
    }
    // Delivery/pickup orders still need a rider — let every rider device know
    // there's something to claim, same pool the Rider screen itself shows.
    if (order.channel !== "dine_in" && !order.riderId) {
      push.notifyRoles(["rider"], {
        title: "Order ready for pickup",
        body: `#${order.id} → ${order.channel === "delivery" ? order.deliveryAddress : "counter pickup"}. First to claim it gets it.`,
        data: { orderId: String(order.id) }
      });
    }
    return;
  }

  if (status === "out_for_delivery") {
    if (!order.customerId) return;
    push.notifyUsers([order.customerId], {
      title: "Out for delivery",
      body: `${order.riderName || "Your rider"} is on the way with order #${order.id}.`,
      data: { orderId: String(order.id) }
    });
    return;
  }

  if (status === "delivered" || status === "picked_up") {
    if (!order.customerId) return;
    push.notifyUsers([order.customerId], {
      title: status === "delivered" ? "Delivered — enjoy!" : "Order picked up",
      body:
        status === "delivered"
          ? `Order #${order.id} has arrived. Thanks for ordering from Devi's Kitchen.`
          : `Order #${order.id} has been picked up. Enjoy!`,
      data: { orderId: String(order.id) }
    });
  }
}

// Owner/staff assign a rider to a ready order; a rider can also self-claim
// from the unassigned pool by passing their own staffId. A rider's claim is an
// atomic "only if still unclaimed" update, so two riders tapping the same order
// can't both win it.
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

  let updated;
  if (req.user.role === "rider") {
    if (Number(riderId) !== req.user.staffId) {
      return res.status(403).json({ error: "Riders can only assign orders to themselves" });
    }
    updated = await orders.claim(req.params.id, riderId);
    if (!updated) {
      return res.status(409).json({ error: "Someone already picked this one up — check the available list again." });
    }
  } else {
    updated = await orders.assignRider(req.params.id, riderId);
  }

  push.notifyStaffId(riderId, {
    title: `New delivery — #${updated.id}`,
    body:
      updated.channel === "delivery"
        ? `${updated.deliveryAddress}${updated.deliveryPhone ? ` · ${updated.deliveryPhone}` : ""} · ${itemsLabel(updated.items)}`
        : `Counter pickup · ${itemsLabel(updated.items)}`,
    data: { orderId: String(updated.id) }
  });
  res.json({ order: updated });
});

// A rider backs out of an order they claimed, before it has left the shop —
// it goes straight back into the pool for everyone else.
exports.releaseOrder = asyncHandler(async (req, res) => {
  const released = await orders.release(req.params.id, req.user.staffId);
  if (!released) {
    return res.status(404).json({ error: "You don't currently hold this order, or it has already left the shop" });
  }
  res.json({ order: released });
});

exports.cancelOrder = asyncHandler(async (req, res) => {
  res.json({ order: await cancelWithRestock(req.params.id, req.user) });
});

exports.updateOrderPriority = asyncHandler(async (req, res) => {
  const { priority } = req.body;
  if (typeof priority !== "boolean") return res.status(400).json({ error: "priority must be a boolean" });
  const order = await orders.updatePriority(req.params.id, priority);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ order });
});

exports.updateOrderPayment = asyncHandler(async (req, res) => {
  const { paymentStatus } = req.body;
  if (!["unpaid", "paid"].includes(paymentStatus)) {
    return res.status(400).json({ error: `paymentStatus must be 'unpaid' or 'paid'` });
  }
  const order = await orders.updatePaymentStatus(req.params.id, paymentStatus);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ order });
});
