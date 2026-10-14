// Tests for the order, scheduling, delivery-fee, reporting and permission rules, run
// with `npm test`. The database layer is replaced by a small in-memory fake, so these
// need no Postgres and no network — they check the business rules, not SQL.
const { test, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

// Freeze the clock on a Wednesday, 12:00 IST (inside the default 11:00-22:00 hours).
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-14T06:30:00Z") });

const root = path.join(__dirname, "..");
const stub = (rel, exports) => {
  const file = require.resolve(path.join(root, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
// Libraries the controllers pull in but these tests don't exercise; stubbed only if
// they aren't installed, so the tests also run on a fresh checkout without `npm install`.
for (const [name, fake] of Object.entries({
  bcryptjs: { hashSync: (p) => `hash:${p}`, compareSync: (p, h) => h === `hash:${p}` },
  jsonwebtoken: { sign: () => "token", verify: () => ({}) }
})) {
  try {
    require.resolve(name);
  } catch {
    const orig = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
      return request === name ? `stub:${name}` : orig.call(this, request, ...rest);
    };
    require.cache[`stub:${name}`] = { id: name, filename: name, loaded: true, exports: fake };
  }
}

// Real bcryptjs when installed, otherwise the stub registered above (same hashSync/compareSync shape).
const bcrypt = require("bcryptjs");

// ---- in-memory "database" ----
let db;
const reset = () => {
  db = {
    menu: [
      { id: 1, name: "Paneer Butter Masala", category: "mains", price: 220, unit: "plate", inStock: true },
      { id: 2, name: "Sold out thali", category: "mains", price: 90, unit: "plate", inStock: false },
      { id: 3, name: "Masala Chai", category: "beverages", price: 40, unit: "cup", inStock: true },
      { id: 6, name: "Biryani by the kg", category: "custom", price: 550, unit: "kg", inStock: true },
      { id: 7, name: "Priced on request", category: "mains", price: null, unit: "plate", inStock: true }
    ],
    recipes: { 1: [{ inventoryId: 4, qtyPerUnit: 0.5 }], 6: [{ inventoryId: 4, qtyPerUnit: 0.2 }] },
    inventory: { 4: 10 },
    orders: [],
    nextId: 1,
    users: [{ id: 2, staffId: 1, role: "staff", passwordHash: bcrypt.hashSync("old-password-1", 4) }],
    staff: [{ id: 1, status: "clocked_out" }, { id: 2, status: "clocked_out" }],
    settings: {},
    failDeduct: false
  };
};
reset();

stub("data/menuItems.js", { getForPricing: async (ids) => db.menu.filter((m) => ids.includes(m.id)) });
stub("data/recipes.js", { getForMenuItem: async (id) => db.recipes[id] || [] });
stub("data/inventory.js", {
  deduct: async (id, amt) => {
    if (db.failDeduct) throw new Error("db down");
    db.inventory[id] = Math.max(0, db.inventory[id] - amt);
  },
  restock: async (id, amt) => {
    db.inventory[id] += amt;
  },
  getAll: async () => [],
  update: async (id, f) => ({ id, ...f }),
  // Used by reportsController's "ingredient cost" stat — just needs to resolve.
  getIngredientCostSince: async () => 0
});
stub("data/orders.js", {
  create: async (o) => {
    const order = { id: db.nextId++, status: "placed", createdAt: new Date().toISOString(), riderId: null, priority: false, ...o };
    db.orders.push(order);
    return order;
  },
  getById: async (id) => db.orders.find((o) => o.id === Number(id)) || null,
  updateStatus: async (id, status) => {
    const o = db.orders.find((x) => x.id === Number(id));
    if (!o) return null;
    o.status = status;
    return o;
  },
  getAll: async () => [...db.orders].reverse(),
  getToday: async () => db.orders,
  getActive: async () => db.orders.filter((o) => !["delivered", "picked_up", "cancelled"].includes(o.status)),
  getRecent: async (limit = 5) => [...db.orders].reverse().slice(0, limit),
  countActive: async () => db.orders.filter((o) => !["delivered", "picked_up", "cancelled"].includes(o.status)).length,
  unpaidTotals: async () => {
    const unpaid = db.orders.filter((o) => o.paymentStatus !== "paid" && o.status !== "cancelled");
    return { count: unpaid.length, total: unpaid.reduce((sum, o) => sum + o.total, 0) };
  },
  getUnassignedReady: async () => db.orders.filter((o) => o.status === "ready" && o.channel !== "dine_in" && !o.riderId),
  getByRiderId: async (id) => db.orders.filter((o) => o.riderId === Number(id)),
  assignRider: async (id, riderId) => Object.assign(db.orders.find((o) => o.id === Number(id)), { riderId: Number(riderId) }),
  // Same "only if still unclaimed" rule as the SQL: the loser gets null.
  claim: async (id, riderId) => {
    const o = db.orders.find((x) => x.id === Number(id));
    if (!o || o.status !== "ready" || o.riderId) return null;
    o.riderId = Number(riderId);
    return o;
  },
  release: async (id, riderId) => {
    const o = db.orders.find((x) => x.id === Number(id));
    if (!o || o.riderId !== Number(riderId) || o.status !== "ready") return null;
    o.riderId = null;
    return o;
  }
});
stub("data/expenses.js", { getAll: async () => [] });
stub("data/staff.js", {
  getAll: async () => db.staff,
  updateStatus: async (id, status) => Object.assign(db.staff.find((s) => s.id === Number(id)), { status })
});
stub("data/users.js", {
  findById: async (id) => db.users.find((u) => u.id === Number(id)),
  resetPassword: async (id, hash) => Object.assign(db.users.find((u) => u.id === Number(id)), { passwordHash: hash })
});
stub("data/settings.js", { getAll: async () => db.settings, set: async (k, v) => { db.settings[k] = v; } });
// Push notifications and geocoding hit Firebase / Nominatim over the network — stubbed so
// the tests keep the "no Postgres, no network" rule.
const noop = () => {};
stub("services/push.js", { notifyUsers: noop, notifyRoles: noop, notifyRolesExcludingUser: noop, notifyStaffId: noop });
stub("services/geocode.js", { forwardGeocode: async () => null, reverseGeocode: async () => null });
// A transaction that really rolls back: snapshot the fake DB, restore it on error.
stub("config/transaction.js", {
  withTransaction: async (fn) => {
    const snapshot = structuredClone(db);
    try {
      return await fn({});
    } catch (err) {
      Object.assign(db, snapshot);
      throw err;
    }
  }
});

const orderController = require("../controllers/orderController");
const authController = require("../controllers/authController");
const reportsController = require("../controllers/reportsController");
const dashboardController = require("../controllers/dashboardController");
const staffController = require("../controllers/staffController");
const inventoryController = require("../controllers/inventoryController");
const ordering = require("../services/ordering");
const { rateLimit } = require("../middleware/security");

// Calls a controller like Express would; resolves to { status, body }.
const call = async (handler, { user, body = {}, params = {}, query = {} }) => {
  const res = {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    set() { return this; },
    end() { return this; }
  };
  let error;
  await handler({ user, body, params, query, ip: "1.1.1.1" }, res, (e) => (error = e));
  if (error) return { status: error.status || 500, body: { error: error.message } };
  return { status: res.statusCode, body: res.body };
};

const customer = { id: 10, name: "Priya", role: "customer" };
const staffUser = { id: 2, name: "Divya", role: "staff", staffId: 1 };
const owner = { id: 1, name: "Owner", role: "owner" };
const rider = (staffId) => ({ id: 100 + staffId, name: `Rider ${staffId}`, role: "rider", staffId });
// About 1 km and 3.4 km from the default restaurant location (Bengaluru centre), and far outside every zone.
const NEAR = { deliveryLat: 12.975, deliveryLng: 77.6 };
const MID = { deliveryLat: 12.99, deliveryLng: 77.62 };
const FAR = { deliveryLat: 13.2, deliveryLng: 77.9 };

beforeEach(reset);

test("prices come from the menu, not from the request", async () => {
  const r = await call(orderController.createOrder, {
    user: customer,
    body: { items: [{ menuItemId: 1, qty: 2, price: 1, name: "hacked" }], total: 1, channel: "pickup", paymentMethod: "cash" }
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.total, 440);
  assert.equal(r.body.order.items[0].price, 220);
  assert.equal(r.body.order.items[0].name, "Paneer Butter Masala");
});

test("made-to-order items are priced per kg and use ingredients per kg", async () => {
  const r = await call(orderController.createOrder, {
    user: customer,
    body: { channel: "pickup", items: [{ menuItemId: 6, qty: 1, size: 2, price: 5, name: "Biryani by the kg — 2kg, Chicken" }] }
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.total, 1100);
  assert.equal(r.body.order.items[0].name, "Biryani by the kg — 2kg, Chicken");
  assert.equal(db.inventory[4], 10 - 0.2 * 2);
});

test("made-to-order items reject an out-of-range size", async () => {
  for (const size of [0, 0.2, 99, "abc"]) {
    const r = await call(orderController.createOrder, { user: customer, body: { channel: "pickup", items: [{ menuItemId: 6, size }] } });
    assert.equal(r.status, 400, `size ${size}`);
  }
});

test("sold-out, unpriced, unknown items and bad quantities are rejected", async () => {
  for (const item of [{ menuItemId: 2 }, { menuItemId: 7 }, { menuItemId: 999 }, { menuItemId: 1, qty: -3 }, { menuItemId: 1, qty: 1.5 }]) {
    const r = await call(orderController.createOrder, { user: customer, body: { channel: "pickup", items: [item] } });
    assert.equal(r.status, 400, JSON.stringify(item));
  }
  assert.equal(db.orders.length, 0);
});

test("customer orders start unpaid whatever the method; counter sales are paid", async () => {
  const upi = await call(orderController.createOrder, { user: customer, body: { channel: "pickup", items: [{ menuItemId: 1 }], paymentMethod: "upi" } });
  assert.equal(upi.body.order.paymentStatus, "unpaid");
  const pos = await call(orderController.createOrder, {
    user: staffUser,
    body: { items: [{ menuItemId: 1 }], paymentMethod: "upi", customerName: "Walk-in", channel: "dine_in", tableNumber: "4" }
  });
  assert.equal(pos.body.order.paymentStatus, "paid");
  assert.equal(pos.body.order.channel, "dine_in");
  assert.equal(pos.body.order.tableNumber, "4");
});

test("delivery needs an address; the fee comes from the zone and is added on the server", async () => {
  const noAddress = await call(orderController.createOrder, { user: customer, body: { channel: "delivery", items: [{ menuItemId: 1 }] } });
  assert.equal(noAddress.status, 400);

  const near = await call(orderController.createOrder, {
    user: customer,
    body: { channel: "delivery", deliveryAddress: "12 Main Rd", ...NEAR, items: [{ menuItemId: 1 }], deliveryFee: 0, total: 1 }
  });
  assert.equal(near.status, 201);
  assert.equal(near.body.order.deliveryFee, 30);
  assert.equal(near.body.order.total, 250);

  const mid = await call(orderController.createOrder, {
    user: customer,
    body: { channel: "delivery", deliveryAddress: "12 Main Rd", ...MID, items: [{ menuItemId: 1 }] }
  });
  assert.equal(mid.body.order.deliveryFee, 60);
  assert.equal(mid.body.order.deliveryZone, "Further out (up to 7 km)");
});

test("delivery is free above the zone's threshold and refused beyond the last zone", async () => {
  const big = await call(orderController.createOrder, {
    user: customer,
    body: { channel: "delivery", deliveryAddress: "12 Main Rd", ...NEAR, items: [{ menuItemId: 1, qty: 3 }] }
  });
  assert.equal(big.body.order.deliveryFee, 0);
  assert.equal(big.body.order.total, 660);

  const far = await call(orderController.createOrder, {
    user: customer,
    body: { channel: "delivery", deliveryAddress: "Far away", ...FAR, items: [{ menuItemId: 1 }] }
  });
  assert.equal(far.status, 400);
  assert.match(far.body.error, /deliver up to 7 km/);
});

test("a zone's minimum order is enforced", async () => {
  const r = await call(orderController.createOrder, {
    user: customer,
    body: { channel: "delivery", deliveryAddress: "12 Main Rd", ...MID, items: [{ menuItemId: 3 }] }
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /minimum order of ₹200/);
});

test("with no coordinates the outermost zone's terms apply", async () => {
  const r = await call(orderController.createOrder, {
    user: customer,
    body: { channel: "delivery", deliveryAddress: "Somewhere typed", items: [{ menuItemId: 1 }] }
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.deliveryFee, 60);
});

test("quote returns the same fee checkout will charge", async () => {
  const q = await call(orderController.quoteOrder, {
    user: customer,
    body: { channel: "delivery", ...NEAR, items: [{ menuItemId: 1, qty: 1 }] }
  });
  assert.equal(q.body.itemsTotal, 220);
  assert.equal(q.body.deliveryFee, 30);
  assert.equal(q.body.total, 250);
  assert.equal(q.body.estimated, false);
  const pickup = await call(orderController.quoteOrder, { user: customer, body: { channel: "pickup", items: [{ menuItemId: 1 }] } });
  assert.equal(pickup.body.deliveryFee, 0);
});

test("if stock deduction fails, the order is not saved", async () => {
  db.failDeduct = true;
  const r = await call(orderController.createOrder, { user: customer, body: { channel: "pickup", items: [{ menuItemId: 1 }] } });
  assert.equal(r.status, 500);
  assert.equal(db.orders.length, 0);
});

test("cancelling via the status dropdown returns stock, and can't be reopened", async () => {
  const { body } = await call(orderController.createOrder, { user: customer, body: { channel: "pickup", items: [{ menuItemId: 1, qty: 2 }] } });
  assert.equal(db.inventory[4], 9);
  const c = await call(orderController.updateOrderStatus, { user: staffUser, params: { id: body.order.id }, body: { status: "cancelled" } });
  assert.equal(c.body.order.status, "cancelled");
  assert.equal(db.inventory[4], 10);
  const again = await call(orderController.cancelOrder, { user: staffUser, params: { id: body.order.id } });
  assert.equal(again.status, 400);
  assert.equal(db.inventory[4], 10);
  const reopen = await call(orderController.updateOrderStatus, { user: staffUser, params: { id: body.order.id }, body: { status: "placed" } });
  assert.equal(reopen.status, 400);
});

test("customers can only cancel their own order while it's placed", async () => {
  const { body } = await call(orderController.createOrder, { user: customer, body: { channel: "pickup", items: [{ menuItemId: 1 }] } });
  const other = await call(orderController.cancelOrder, { user: { ...customer, id: 99 }, params: { id: body.order.id } });
  assert.equal(other.status, 403);
  await call(orderController.updateOrderStatus, { user: staffUser, params: { id: body.order.id }, body: { status: "preparing" } });
  const late = await call(orderController.cancelOrder, { user: customer, params: { id: body.order.id } });
  assert.equal(late.status, 400);
});

test("reports and dashboard leave out cancelled orders and use India dates", async () => {
  db.orders.push(
    { id: 1, status: "delivered", total: 300, items: [{ name: "A", qty: 1 }], createdAt: "2026-10-13T19:00:00Z" }, // 00:30 IST Oct 14
    { id: 2, status: "cancelled", total: 5000, items: [{ name: "B", qty: 9 }], createdAt: "2026-10-14T05:00:00Z" },
    { id: 3, status: "placed", total: 200, items: [{ name: "A", qty: 1 }], createdAt: "2026-10-14T05:00:00Z" }
  );
  const rep = await call(reportsController.getSummary, { user: owner });
  const today = rep.body.last7Days.at(-1);
  assert.equal(today.date, "2026-10-14");
  assert.equal(today.revenue, 500);
  assert.equal(rep.body.allTimeRevenue, 500);
  assert.deepEqual(rep.body.bestSellers, [{ name: "A", qty: 2 }]);

  const dash = await call(dashboardController.getSummary, { user: owner });
  assert.equal(dash.body.todaysRevenue, 500);
  assert.equal(dash.body.pendingOrders, 1);
  // Queue holds only orders still in progress; money to collect skips cancelled ones.
  assert.deepEqual(dash.body.queue.map((o) => o.id), [3]);
  assert.equal(dash.body.toCook, 1);
  assert.equal(dash.body.awaitingPayment.count, 2);
  assert.equal(dash.body.awaitingPayment.total, 500);
});

test("staff can change only their own clock status; owner can change anyone's", async () => {
  const own = await call(staffController.updateStatus, { user: staffUser, params: { id: 1 }, body: { status: "clocked_in" } });
  assert.equal(own.status, 200);
  const other = await call(staffController.updateStatus, { user: staffUser, params: { id: 2 }, body: { status: "absent" } });
  assert.equal(other.status, 403);
  const byOwner = await call(staffController.updateStatus, { user: owner, params: { id: 2 }, body: { status: "absent" } });
  assert.equal(byOwner.status, 200);
});

test("staff can restock quantities but not rename ingredients", async () => {
  const qty = await call(inventoryController.updateItem, { user: staffUser, params: { id: 4 }, body: { quantity: 20 } });
  assert.equal(qty.status, 200);
  const rename = await call(inventoryController.updateItem, { user: staffUser, params: { id: 4 }, body: { name: "Sugar" } });
  assert.equal(rename.status, 403);
});

test("login rate limit blocks the 11th attempt", () => {
  const limiter = rateLimit({ windowMs: 60000, max: 10, message: "slow down" });
  let blocked = 0;
  for (let i = 0; i < 11; i++) {
    const res = { set() {}, status(c) { this.code = c; return this; }, json() { blocked++; } };
    limiter({ ip: "9.9.9.9" }, res, () => {});
  }
  assert.equal(blocked, 1);
});

test("time slots: past, invalid and too-far choices are rejected; a valid one is saved", async () => {
  const book = (extra, items = [{ menuItemId: 1 }]) =>
    call(orderController.createOrder, { user: customer, body: { channel: "pickup", ...extra, items } });
  assert.equal((await book({ scheduleDate: "2026-10-14", scheduleSlot: "11:00" })).status, 400, "11 AM today has passed");
  assert.equal((await book({ scheduleDate: "2026-10-14", scheduleSlot: "12:00" })).status, 400, "inside the 30-minute notice");
  assert.equal((await book({ scheduleDate: "2026-10-15", scheduleSlot: "10:15" })).status, 400, "not a real slot");
  assert.equal((await book({ scheduleDate: "2026-10-30", scheduleSlot: "13:00" })).status, 400, "too far ahead");
  assert.equal((await book({ scheduleSlot: "13:00" })).status, 400, "slot without a day");
  const ok = await book({ scheduleDate: "2026-10-16", scheduleSlot: "17:30" });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.order.scheduledDate, "2026-10-16");
  assert.equal(ok.body.order.scheduledSlot, "17:30");
  // No slot at all means "as soon as possible", fine while open.
  const asap = await book({});
  assert.equal(asap.status, 201);
  assert.equal(asap.body.order.scheduledSlot, null);
  // Counter sales never book a slot.
  const pos = await call(orderController.createOrder, { user: staffUser, body: { items: [{ menuItemId: 1 }], channel: "pickup" } });
  assert.equal(pos.status, 201);
  assert.equal(pos.body.order.scheduledSlot, null);
});

test("closed weekdays can't be booked, and ASAP is refused outside opening hours", async () => {
  db.settings.orderingConfig = JSON.stringify({ closedWeekdays: [4] }); // Thursday
  const closedDay = await call(orderController.createOrder, {
    user: customer,
    body: { channel: "pickup", items: [{ menuItemId: 1 }], scheduleDate: "2026-10-15", scheduleSlot: "13:00" }
  });
  assert.equal(closedDay.status, 400);

  const config = await ordering.getConfig();
  const lateNight = Date.parse("2026-10-14T20:00:00Z"); // 01:30 IST
  assert.equal(ordering.isOpenNow(config, lateNight), false);
  assert.throws(() => ordering.resolveSchedule(config, {}, lateNight), /closed right now/);
});

test("store status lists bookable days and slots", () => {
  return call(orderController.getStoreStatus, { user: undefined }).then(({ body }) => {
    assert.equal(body.openNow, true);
    assert.equal(body.days[0].label, "Today");
    assert.equal(body.days[0].slots[0].value, "12:30", "first slot at least 30 minutes after noon");
    assert.equal(body.days[0].slots.at(-1).label, "9:30 PM");
    assert.equal(body.days.length, 4);
    assert.equal(body.zones.length, 2);
  });
});

test("owner ordering settings are validated", () => {
  assert.throws(() => ordering.sanitizeConfig({ open: "12:00", close: "11:00" }), /after opening/);
  assert.throws(() => ordering.sanitizeConfig({ slotMinutes: 25 }), /Slot length/);
  assert.throws(() => ordering.sanitizeConfig({ zones: [{ maxKm: 3, fee: 10 }, { maxKm: 3, fee: 20 }] }), /same distance/);
  assert.throws(() => ordering.sanitizeConfig({ closedWeekdays: [0, 1, 2, 3, 4, 5, 6] }), /every day/);
  const ok = ordering.sanitizeConfig({ zones: [{ maxKm: 8, fee: 50 }, { maxKm: 2, fee: 10 }] });
  assert.deepEqual(ok.zones.map((z) => z.maxKm), [2, 8], "zones are sorted nearest first");
});

const readyDelivery = () =>
  db.orders.push({ id: 50, status: "ready", channel: "delivery", riderId: null, total: 300, items: [], deliveryAddress: "x", customerName: "C" });

test("two riders can't both claim the same order", async () => {
  readyDelivery();
  const first = await call(orderController.assignRider, { user: rider(4), params: { id: 50 }, body: { riderId: 4 } });
  assert.equal(first.status, 200);
  assert.equal(db.orders[0].riderId, 4);
  const second = await call(orderController.assignRider, { user: rider(5), params: { id: 50 }, body: { riderId: 5 } });
  assert.equal(second.status, 409);
  assert.equal(db.orders[0].riderId, 4);
});

test("a rider can only claim for themselves and release only their own order", async () => {
  readyDelivery();
  const forOther = await call(orderController.assignRider, { user: rider(4), params: { id: 50 }, body: { riderId: 5 } });
  assert.equal(forOther.status, 403);
  await call(orderController.assignRider, { user: rider(4), params: { id: 50 }, body: { riderId: 4 } });
  const wrongRider = await call(orderController.releaseOrder, { user: rider(5), params: { id: 50 } });
  assert.equal(wrongRider.status, 404);
  const own = await call(orderController.releaseOrder, { user: rider(4), params: { id: 50 } });
  assert.equal(own.status, 200);
  assert.equal(db.orders[0].riderId, null);
});

test("riders can only move their own orders through the hand-off steps", async () => {
  readyDelivery();
  await call(orderController.assignRider, { user: rider(4), params: { id: 50 }, body: { riderId: 4 } });
  const notMine = await call(orderController.updateOrderStatus, { user: rider(5), params: { id: 50 }, body: { status: "out_for_delivery" } });
  assert.equal(notMine.status, 403);
  const kitchenStep = await call(orderController.updateOrderStatus, { user: rider(4), params: { id: 50 }, body: { status: "preparing" } });
  assert.equal(kitchenStep.status, 403);
  const ok = await call(orderController.updateOrderStatus, { user: rider(4), params: { id: 50 }, body: { status: "out_for_delivery" } });
  assert.equal(ok.status, 200);
});

test("the unassigned list puts urgent orders first, then nearest", async () => {
  const base = { status: "ready", channel: "delivery", riderId: null, total: 100, items: [], customerName: "C" };
  db.orders.push(
    { ...base, id: 1, priority: false, ...NEAR },
    { ...base, id: 2, priority: false, ...MID },
    { ...base, id: 3, priority: true, ...MID },
    { ...base, id: 4, priority: false } // no coordinates: unknown distance sorts last
  );
  const r = await call(orderController.getUnassigned, { user: rider(4) });
  assert.deepEqual(r.body.orders.map((o) => o.id), [3, 1, 2, 4]);
  assert.ok(r.body.orders[1].distanceFromStoreKm < r.body.orders[2].distanceFromStoreKm);
  assert.equal(r.body.orders[3].distanceFromStoreKm, null);
});

test("changing your own password needs the current one, and the new one must be strong and not a published demo password", async () => {
  const change = (body) => call(authController.changePassword, { user: staffUser, body });
  assert.equal((await change({ currentPassword: "wrong", newPassword: "a-good-new-pass" })).status, 401);
  assert.equal((await change({ currentPassword: "old-password-1", newPassword: "short" })).status, 400);
  assert.equal((await change({ currentPassword: "old-password-1", newPassword: "staff123" })).status, 400, "published demo password");
  assert.equal((await change({ newPassword: "a-good-new-pass" })).status, 400, "current password missing");
  assert.ok(bcrypt.compareSync("old-password-1", db.users[0].passwordHash), "nothing changed after the rejections");
  const ok = await change({ currentPassword: "old-password-1", newPassword: "a-good-new-pass" });
  assert.equal(ok.status, 200);
  assert.ok(bcrypt.compareSync("a-good-new-pass", db.users[0].passwordHash));
});
