const plans = require("../data/subscriptionPlans");
const settings = require("../data/subscriptionSettings");
const subscriptions = require("../data/subscriptions");
const menuItems = require("../data/menuItems");
const pricing = require("../services/subscriptionPricing");
const push = require("../services/push");
const asyncHandler = require("../middleware/asyncHandler");

const VALID_SLOTS = ["breakfast", "lunch", "dinner"];
const VALID_CYCLES = Object.keys(pricing.CYCLE_DAYS);

// Stored (and so displayed, everywhere) in a fixed breakfast->lunch->dinner
// order regardless of what order the owner happened to tick the checkboxes
// in — a plan is never "Lunch, Breakfast, Dinner".
const sortSlots = (slots) => [...slots].sort((a, b) => VALID_SLOTS.indexOf(a) - VALID_SLOTS.indexOf(b));

const MAX_ITEMS_PER_MEAL_CAP = 10;

// Shared by create (everything required) and update (only whatever fields
// are actually present) — previously update skipped validation entirely and
// let a bad value hit the database's own CHECK constraint as a raw 500.
function validatePlanFields(fields, { partial }) {
  if (!partial || fields.cycle !== undefined) {
    if (!VALID_CYCLES.includes(fields.cycle)) return `cycle must be one of ${VALID_CYCLES.join(", ")}`;
  }
  if (!partial || fields.mealSlots !== undefined) {
    if (!Array.isArray(fields.mealSlots) || fields.mealSlots.length === 0) return "at least one meal slot is required";
    if (!fields.mealSlots.every((s) => VALID_SLOTS.includes(s))) return `meal slots must be from ${VALID_SLOTS.join(", ")}`;
  }
  if (!partial || fields.maxItemsPerMeal !== undefined) {
    const n = Number(fields.maxItemsPerMeal);
    if (!Number.isInteger(n) || n < 1 || n > MAX_ITEMS_PER_MEAL_CAP) {
      return `maxItemsPerMeal must be a whole number between 1 and ${MAX_ITEMS_PER_MEAL_CAP}`;
    }
  }
  if (!partial && !fields.name) return "name is required";
  return null;
}

// ---- Plans (owner manages; anyone logged in can browse active ones) ----

exports.getActivePlans = asyncHandler(async (req, res) => {
  res.json({ plans: await plans.getAll({ activeOnly: true }) });
});

exports.getAllPlans = asyncHandler(async (req, res) => {
  res.json({ plans: await plans.getAll() });
});

exports.createPlan = asyncHandler(async (req, res) => {
  const { name, cycle, mealSlots, maxItemsPerMeal } = req.body;
  const error = validatePlanFields({ name, cycle, mealSlots, maxItemsPerMeal }, { partial: false });
  if (error) return res.status(400).json({ error });
  const plan = await plans.create({ name, cycle, mealSlots: sortSlots(mealSlots), maxItemsPerMeal: Number(maxItemsPerMeal) });
  res.status(201).json({ plan });
});

exports.updatePlan = asyncHandler(async (req, res) => {
  const fields = { ...req.body };
  const error = validatePlanFields(fields, { partial: true });
  if (error) return res.status(400).json({ error });
  if (fields.mealSlots) fields.mealSlots = sortSlots(fields.mealSlots);
  if (fields.maxItemsPerMeal !== undefined) fields.maxItemsPerMeal = Number(fields.maxItemsPerMeal);
  const plan = await plans.update(req.params.id, fields);
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  res.json({ plan });
});

exports.deletePlan = asyncHandler(async (req, res) => {
  try {
    await plans.remove(req.params.id);
  } catch (err) {
    // Postgres 23503 = foreign_key_violation — someone (even a cancelled
    // subscriber) still references this plan. The confirm dialog used to
    // claim deleting "won't affect anyone already subscribed", which was
    // simply wrong: it doesn't warn and skip them, it fails outright.
    // Deactivating (the Active/Inactive toggle) is the actual way to stop
    // new signups without touching historical subscriber records.
    if (err.code === "23503") {
      return res.status(409).json({
        error: "This plan has subscribers (including past/cancelled ones) and can't be deleted — set it to Inactive instead to stop new signups."
      });
    }
    throw err;
  }
  res.status(204).end();
});

// ---- Settings (discount tiers + delivery fee) ----

exports.getSettings = asyncHandler(async (req, res) => {
  const [discounts, deliveryFeePerDay] = await Promise.all([settings.getDiscounts(), settings.getDeliveryFeePerDay()]);
  res.json({ discounts, deliveryFeePerDay });
});

exports.updateDiscount = asyncHandler(async (req, res) => {
  const { cycle, discountPercent } = req.body;
  if (!VALID_CYCLES.includes(cycle)) {
    return res.status(400).json({ error: `cycle must be one of ${VALID_CYCLES.join(", ")}` });
  }
  const percent = Number(discountPercent);
  if (Number.isNaN(percent) || percent < 0 || percent > 100) {
    return res.status(400).json({ error: "discountPercent must be a number between 0 and 100" });
  }
  const discounts = await settings.updateDiscount(cycle, percent);
  res.json({ discounts });
});

exports.updateDeliveryFee = asyncHandler(async (req, res) => {
  const fee = Number(req.body.deliveryFeePerDay);
  if (Number.isNaN(fee) || fee < 0) {
    return res.status(400).json({ error: "deliveryFeePerDay must be a non-negative number" });
  }
  const deliveryFeePerDay = await settings.updateDeliveryFeePerDay(fee);
  res.json({ deliveryFeePerDay });
});

// ---- Eligible items (for building selections) ----

exports.getEligibleItems = asyncHandler(async (req, res) => {
  res.json({ items: await menuItems.getSubscriptionEligible() });
});

// ---- Pricing preview + actual subscribe ----

// Shared by /quote (preview, nothing saved) and createSubscription (locks
// the result in) — re-fetches the plan, discount, delivery fee, and item
// prices itself every time rather than trusting anything the client sent,
// same "never trust a client-computed total" rule the rest of the app follows.
async function buildQuote({ planId, channel, selections }) {
  const plan = await plans.getById(planId);
  if (!plan) {
    const err = new Error("Plan not found");
    err.status = 404;
    throw err;
  }
  if (!plan.isActive) {
    const err = new Error("This plan isn't currently available");
    err.status = 400;
    throw err;
  }
  if (!["delivery", "pickup"].includes(channel)) {
    const err = new Error("channel must be 'delivery' or 'pickup'");
    err.status = 400;
    throw err;
  }

  const cleanSelections = (Array.isArray(selections) ? selections : []).filter((s) => plan.mealSlots.includes(s.slot));
  for (const sel of cleanSelections) {
    if ((sel.itemIds || []).length > plan.maxItemsPerMeal) {
      const err = new Error(`${sel.slot} can have at most ${plan.maxItemsPerMeal} items`);
      err.status = 400;
      throw err;
    }
  }

  const [eligibleItems, discounts, deliveryFeePerDay] = await Promise.all([
    menuItems.getSubscriptionEligible(),
    settings.getDiscounts(),
    settings.getDeliveryFeePerDay()
  ]);
  const itemsById = {};
  eligibleItems.forEach((it) => { itemsById[it.id] = it; });

  // Client-side already disables a sold-out item's chip, but that's cosmetic
  // — nothing previously stopped a direct API call from picking one anyway.
  for (const sel of cleanSelections) {
    for (const itemId of sel.itemIds || []) {
      const item = itemsById[itemId];
      if (item && !item.inStock) {
        const err = new Error(`${item.name} is currently sold out — pick something else for ${sel.slot}`);
        err.status = 400;
        throw err;
      }
    }
  }

  const quote = pricing.computeQuote({
    cycle: plan.cycle,
    channel,
    selections: cleanSelections,
    itemsById,
    discountPercent: discounts[plan.cycle] || 0,
    deliveryFeePerDay
  });

  return { plan, quote, cleanSelections };
}

exports.getQuote = asyncHandler(async (req, res) => {
  const { planId, channel, selections } = req.body;
  if (!planId) return res.status(400).json({ error: "planId is required" });
  const { quote } = await buildQuote({ planId, channel: channel || "delivery", selections });
  res.json({ quote });
});

exports.createSubscription = asyncHandler(async (req, res) => {
  const { planId, channel, selections, deliveryAddress, deliveryPhone, paymentMethod } = req.body;
  if (!planId) return res.status(400).json({ error: "planId is required" });
  if (channel === "delivery" && !deliveryAddress) {
    return res.status(400).json({ error: "deliveryAddress is required for delivery subscriptions" });
  }
  const { plan, quote, cleanSelections } = await buildQuote({ planId, channel, selections });
  if (quote.dailyTotal <= 0) {
    return res.status(400).json({ error: "Pick at least one item before subscribing" });
  }

  const validPayment = ["cash", "upi", "card"];
  if (paymentMethod && !validPayment.includes(paymentMethod)) {
    return res.status(400).json({ error: `paymentMethod must be one of ${validPayment.join(", ")}` });
  }
  // Same simulated-payment rule as one-off orders (server/controllers/orderController.js):
  // upi/card is treated as paid immediately, cash stays unpaid until staff confirms it in person.
  const paymentStatus = paymentMethod && paymentMethod !== "cash" ? "paid" : "unpaid";

  const subscription = await subscriptions.create({
    customerId: req.user.id,
    planId,
    channel,
    deliveryAddress: channel === "delivery" ? deliveryAddress : null,
    deliveryPhone: channel === "delivery" ? deliveryPhone : null,
    cycleStartDate: new Date().toISOString().slice(0, 10),
    cycleDays: quote.days,
    selections: cleanSelections,
    foodSubtotal: quote.foodSubtotal,
    discountPercent: quote.discountPercent,
    deliveryFeeTotal: quote.deliveryFeeTotal,
    totalAmount: quote.totalAmount,
    paymentMethod: paymentMethod || "cash",
    paymentStatus
  });

  // Same "owner + every staff device" broadcast as a new one-off order
  // (server/controllers/orderController.js) — a recurring customer is exactly
  // as relevant to the kitchen as a one-time one.
  push.notifyRoles(["owner", "staff"], {
    title: `New subscription — ${plan.name}`,
    body: `${req.user.name} — ₹${quote.totalAmount} / cycle · ${channel === "delivery" ? "delivery" : "pickup"}`,
    data: { subscriptionId: String(subscription.id) }
  });

  res.status(201).json({ subscription });
});

// `selections` is stored as raw { slot, itemIds } — genuinely useful to
// nobody looking at it (an owner can't tell what "itemIds: [8, 2]" means).
// Resolves each id against the *full* menu catalog (not just currently-
// subscription-eligible items) so a subscription still shows what was
// actually picked even if that item's category or price changed since, or
// it was marked unavailable — only a fully deleted item would still be
// unresolvable, which is the one gap this doesn't cover.
async function withResolvedSelections(subs) {
  const allItems = await menuItems.getAll();
  const itemsById = {};
  allItems.forEach((it) => { itemsById[it.id] = it; });
  return subs.map((sub) => ({
    ...sub,
    selections: (sub.selections || []).map((sel) => ({
      slot: sel.slot,
      items: (sel.itemIds || [])
        .map((id) => itemsById[id])
        .filter(Boolean)
        .map((it) => ({ id: it.id, name: it.name, price: it.price }))
    }))
  }));
}

exports.getMySubscriptions = asyncHandler(async (req, res) => {
  const subs = await subscriptions.getByCustomerId(req.user.id);
  res.json({ subscriptions: await withResolvedSelections(subs) });
});

exports.getAllSubscriptions = asyncHandler(async (req, res) => {
  const subs = await subscriptions.getAll();
  res.json({ subscriptions: await withResolvedSelections(subs) });
});

exports.updateSubscriptionStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["active", "paused", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "status must be one of active, paused, cancelled" });
  }
  const existing = await subscriptions.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Subscription not found" });
  // A customer can only pause/resume/cancel their own; owner/staff can manage any.
  if (req.user.role === "customer" && existing.customerId !== req.user.id) {
    return res.status(403).json({ error: "Not your subscription" });
  }
  const subscription = await subscriptions.updateStatus(req.params.id, status);

  // Whichever side didn't make the change is the side that needs telling —
  // same rule as cancelOrder in orderController.js. A customer pausing/
  // resuming/cancelling their own subscription doesn't need a push about
  // their own action; owner/staff acting on someone else's subscription does
  // need the customer told, since they didn't initiate it.
  if (req.user.role === "customer") {
    if (status === "cancelled") {
      push.notifyRoles(["owner", "staff"], {
        title: "Subscription cancelled",
        body: `${req.user.name} cancelled their ${existing.planName} subscription.`,
        data: { subscriptionId: String(subscription.id) }
      });
    }
  } else {
    const label = status === "cancelled" ? "cancelled" : status === "paused" ? "paused" : "resumed";
    push.notifyUsers([existing.customerId], {
      title: `Subscription ${label}`,
      body: `Your ${existing.planName} subscription was ${label} by the restaurant.`,
      data: { subscriptionId: String(subscription.id) }
    });
  }

  res.json({ subscription });
});

// A cash subscription's paymentStatus was previously set once at signup
// and could never change — no equivalent of orderController's "Mark paid"
// existed at all for subscriptions.
exports.updateSubscriptionPayment = asyncHandler(async (req, res) => {
  const { paymentStatus } = req.body;
  if (!["unpaid", "paid"].includes(paymentStatus)) {
    return res.status(400).json({ error: "paymentStatus must be 'unpaid' or 'paid'" });
  }
  const subscription = await subscriptions.updatePaymentStatus(req.params.id, paymentStatus);
  if (!subscription) return res.status(404).json({ error: "Subscription not found" });
  res.json({ subscription });
});
