const plans = require("../data/subscriptionPlans");
const settings = require("../data/subscriptionSettings");
const subscriptions = require("../data/subscriptions");
const menuItems = require("../data/menuItems");
const pricing = require("../services/subscriptionPricing");
const asyncHandler = require("../middleware/asyncHandler");

const VALID_SLOTS = ["breakfast", "lunch", "dinner"];
const VALID_CYCLES = Object.keys(pricing.CYCLE_DAYS);

// Stored (and so displayed, everywhere) in a fixed breakfast->lunch->dinner
// order regardless of what order the owner happened to tick the checkboxes
// in — a plan is never "Lunch, Breakfast, Dinner".
const sortSlots = (slots) => [...slots].sort((a, b) => VALID_SLOTS.indexOf(a) - VALID_SLOTS.indexOf(b));

// ---- Plans (owner manages; anyone logged in can browse active ones) ----

exports.getActivePlans = asyncHandler(async (req, res) => {
  res.json({ plans: await plans.getAll({ activeOnly: true }) });
});

exports.getAllPlans = asyncHandler(async (req, res) => {
  res.json({ plans: await plans.getAll() });
});

exports.createPlan = asyncHandler(async (req, res) => {
  const { name, cycle, mealSlots, maxItemsPerMeal } = req.body;
  if (!name || !cycle || !Array.isArray(mealSlots) || mealSlots.length === 0) {
    return res.status(400).json({ error: "name, cycle, and at least one meal slot are required" });
  }
  if (!VALID_CYCLES.includes(cycle)) {
    return res.status(400).json({ error: `cycle must be one of ${VALID_CYCLES.join(", ")}` });
  }
  if (!mealSlots.every((s) => VALID_SLOTS.includes(s))) {
    return res.status(400).json({ error: `meal slots must be from ${VALID_SLOTS.join(", ")}` });
  }
  const plan = await plans.create({ name, cycle, mealSlots: sortSlots(mealSlots), maxItemsPerMeal: Number(maxItemsPerMeal) || 2 });
  res.status(201).json({ plan });
});

exports.updatePlan = asyncHandler(async (req, res) => {
  const fields = { ...req.body };
  if (fields.mealSlots) fields.mealSlots = sortSlots(fields.mealSlots);
  const plan = await plans.update(req.params.id, fields);
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  res.json({ plan });
});

exports.deletePlan = asyncHandler(async (req, res) => {
  await plans.remove(req.params.id);
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

  res.status(201).json({ subscription });
});

exports.getMySubscriptions = asyncHandler(async (req, res) => {
  res.json({ subscriptions: await subscriptions.getByCustomerId(req.user.id) });
});

exports.getAllSubscriptions = asyncHandler(async (req, res) => {
  res.json({ subscriptions: await subscriptions.getAll() });
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
  res.json({ subscription });
});
