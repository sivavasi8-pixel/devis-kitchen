const pool = require("../config/db");
const subscriptions = require("../data/subscriptions");
const plans = require("../data/subscriptionPlans");
const settings = require("../data/subscriptionSettings");
const menuItems = require("../data/menuItems");
const orders = require("../data/orders");
const pricing = require("./subscriptionPricing");
const { adjustStockForItems } = require("./stock");
const push = require("./push");

// Devi's Kitchen is an Asia/Kolkata (IST, UTC+5:30) restaurant no matter
// where the Node process happens to be hosted — Render's container may well
// run in UTC. "Today" has to mean the IST calendar date explicitly: using
// the ambient process timezone (via toISOString, or even local Date getters)
// would make renewal and materialization land a day late for the first ~5.5
// hours of every IST morning whenever the host's own clock isn't IST.
const RESTAURANT_TZ = "Asia/Kolkata";
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: RESTAURANT_TZ });

// pg returns a `date` column as a JS Date built from LOCAL calendar
// components (pg-types' date parser does `new Date(year, month, day)`, not
// a UTC-midnight timestamp) — so on this server (Asia/Kolkata, UTC+5:30),
// value.toISOString() lands on the *previous* day. Reading the date back out
// through getFullYear/Month/Date (also local) undoes exactly that, giving
// the calendar date the row actually stores no matter what timezone the
// process runs in.
function toDateStr(value) {
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${toDateStr(dateStr)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const itemLabel = (it) => `${it.name}${it.qty > 1 ? ` x${it.qty}` : ""}`;

// Stage 2 of the meal subscription feature. Subscribing used to only ever
// record a payment plan — nothing told the kitchen what to actually cook on
// any given day, and a cycle that ran out just sat there unrenewed forever.
// This closes both gaps: every active subscriber's saved item template turns
// into real, normal orders() rows each day, and a finished cycle rolls
// straight into the next one with freshly recomputed pricing.
//
// Deliberately NOT the full day-by-day customizable picker described in
// subscription_meal_selections' own comment (per-day swaps, a cutoff time
// before which a customer can change tomorrow's items) — that's a real,
// separate feature. This always cooks whatever template the subscriber
// picked at signup (or last edited), every day, until they change it.
exports.processDueSubscriptions = async () => {
  const all = await subscriptions.getAll();
  const active = all.filter((s) => s.status === "active");
  if (!active.length) return;

  // Fetched once per run and shared across every subscriber — same "re-price
  // from the live catalog, never trust a stored number" rule buildQuote()
  // itself follows, just amortized instead of one query set per subscriber.
  const [eligibleItems, allItems, discounts, deliveryFeePerDay] = await Promise.all([
    menuItems.getSubscriptionEligible(),
    menuItems.getAll(),
    settings.getDiscounts(),
    settings.getDeliveryFeePerDay()
  ]);
  const eligibleById = {};
  eligibleItems.forEach((it) => { eligibleById[it.id] = it; });
  const allById = {};
  allItems.forEach((it) => { allById[it.id] = it; });

  const today = todayISO();
  const plansById = {};

  for (const sub of active) {
    if (!(sub.planId in plansById)) plansById[sub.planId] = await plans.getById(sub.planId);
    const plan = plansById[sub.planId];
    // Plan row missing would mean the FK it's still under got past
    // deletePlan's block somehow — shouldn't happen, but skip rather than
    // crash the whole run over one bad subscriber.
    if (!plan) continue;

    const renewed = await renewIfDue(sub, plan, eligibleById, discounts, deliveryFeePerDay, today);
    await materializeToday(renewed || sub, plan, allById, today);
  }
};

// A cycle's food_subtotal/discount_percent/delivery_fee_total/total_amount
// are locked in at subscribe time and never rewritten while that cycle is
// still running (see schema.sql) — but once it's over, the next cycle is a
// brand new charge, so it's recomputed fresh against whatever the menu and
// discount tiers say *right now*, exactly like a brand new subscribe would.
// payment_status resets to 'unpaid' too — a previous cycle being paid says
// nothing about whether this new one has been.
async function renewIfDue(sub, plan, eligibleById, discounts, deliveryFeePerDay, today) {
  let cycleStartDate = toDateStr(sub.cycleStartDate);
  let cycleEndDate = addDays(cycleStartDate, sub.cycleDays);
  if (today < cycleEndDate) return null; // current cycle still running

  // Walks forward cycle-by-cycle rather than jumping straight to today, so a
  // subscription survives the scheduler missing several days in a row (e.g.
  // Render's free tier sleeping) and still lands on a real cycle boundary
  // instead of a half-cycle.
  while (today >= cycleEndDate) {
    cycleStartDate = cycleEndDate;
    cycleEndDate = addDays(cycleStartDate, sub.cycleDays);
  }

  const quote = pricing.computeQuote({
    cycle: plan.cycle,
    channel: sub.channel,
    selections: sub.selections,
    itemsById: eligibleById,
    discountPercent: discounts[plan.cycle] || 0,
    deliveryFeePerDay
  });

  await pool.query(
    `update subscriptions set
       cycle_start_date = $1, food_subtotal = $2, discount_percent = $3,
       delivery_fee_total = $4, total_amount = $5, payment_status = 'unpaid'
     where id = $6`,
    [cycleStartDate, quote.foodSubtotal, quote.discountPercent, quote.deliveryFeeTotal, quote.totalAmount, sub.id]
  );
  const updated = await subscriptions.getById(sub.id);

  push.notifyRoles(["owner", "staff"], {
    title: `Subscription renewed — ${plan.name}`,
    body: `${updated.customerName} — new cycle, ₹${updated.totalAmount} due.`,
    data: { subscriptionId: String(updated.id) }
  });
  push.notifyUsers([updated.customerId], {
    title: "Your subscription renewed",
    body: `${plan.name} renewed for another ${plan.cycle} cycle — ₹${updated.totalAmount} due.`,
    data: { subscriptionId: String(updated.id) }
  });

  return updated;
}

// One order per (subscriber, day, meal slot) — breakfast/lunch/dinner get
// prepped and handed off at different times, so they're separate kitchen
// tickets, not one bundled order. subscription_meal_selections is the
// idempotency log: its unique (subscription_id, meal_date, meal_slot)
// constraint means a second run on the same day (the hourly tick, or a
// restart right after one already ran) just finds nothing to insert and
// moves on instead of double-ordering.
async function materializeToday(sub, plan, allById, today) {
  for (const slot of plan.mealSlots) {
    const sel = (sub.selections || []).find((s) => s.slot === slot);
    if (!sel || !sel.itemIds || !sel.itemIds.length) continue; // nothing picked for this slot

    const { rows } = await pool.query(
      // $2 and $5 are the same date on purpose (passed twice, not reused) —
      // Postgres infers a placeholder's type from its first use, so reusing
      // $2 for both the `date` column and the `timestamptz` column below it
      // throws "inconsistent types deduced for parameter" (42P08).
      `insert into subscription_meal_selections (subscription_id, meal_date, meal_slot, item_ids, status, cutoff_at)
       values ($1, $2, $3, $4, 'materialized', $5)
       on conflict (subscription_id, meal_date, meal_slot) do nothing
       returning id`,
      [sub.id, today, slot, sel.itemIds, today]
    );
    if (!rows[0]) continue; // already materialized this slot today

    const qtyById = {};
    for (const id of sel.itemIds) qtyById[id] = (qtyById[id] || 0) + 1;
    const orderItems = Object.entries(qtyById)
      .map(([id, qty]) => {
        const item = allById[id]; // object keys coerce to string, so this matches allById[<numeric id>] too
        return item && { menuItemId: item.id, name: item.name, qty };
      })
      .filter(Boolean);

    if (!orderItems.length) {
      // Every item in the template has since been deleted from the menu —
      // leave the tracking row as 'materialized' with no order_id so this
      // slot/day isn't retried forever, but there's genuinely nothing to cook.
      continue;
    }

    const slotTotal = orderItems.reduce((sum, it) => {
      const item = allById[it.menuItemId];
      return sum + (item && item.price ? Number(item.price) : 0) * it.qty;
    }, 0);

    const order = await orders.create({
      customerName: sub.customerName,
      customerId: sub.customerId,
      items: orderItems,
      total: slotTotal,
      channel: sub.channel,
      paymentMethod: sub.paymentMethod,
      // Mirrors the subscription's own payment status rather than being its
      // own thing — there's no separate per-day charge, the whole cycle was
      // already priced as one lump sum at subscribe/renew time.
      paymentStatus: sub.paymentStatus,
      deliveryAddress: sub.channel === "delivery" ? sub.deliveryAddress : null,
      deliveryPhone: sub.channel === "delivery" ? sub.deliveryPhone : null,
      subscriptionId: sub.id
    });

    await pool.query(
      "update subscription_meal_selections set order_id = $1 where subscription_id = $2 and meal_date = $3 and meal_slot = $4",
      [order.id, sub.id, today, slot]
    );
    await adjustStockForItems(orderItems, "deduct");

    push.notifyRoles(["owner", "staff"], {
      title: `Subscription order — ${slot}`,
      body: `${sub.customerName} — ${orderItems.map(itemLabel).join(", ")} · ${sub.channel}`,
      data: { orderId: String(order.id) }
    });
  }
}
