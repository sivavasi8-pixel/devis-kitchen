// The pricing engine for meal subscriptions — deliberately the ONE place this
// math happens, called both by the live "quote" endpoint (customer building
// their plan, price updates as they tap items) and by the actual subscribe
// endpoint (which locks the result onto the subscription row). Never
// duplicate this arithmetic anywhere else.
//
// Decision H: monthly is a fixed 30 days, not the real calendar month length
// — predictable pricing over calendar-accuracy.
const CYCLE_DAYS = { daily: 1, weekly: 7, monthly: 30 };

exports.CYCLE_DAYS = CYCLE_DAYS;

// selections: [{ slot: "lunch", itemIds: [1, 2] }, ...]
// itemsById: { [id]: { id, name, price } } — only subscription-eligible items
// (regular categories, excludes custom/special — see menuItems data layer)
// should ever be looked up here; a stray/ineligible id is just skipped rather
// than erroring, so a race with someone editing the menu never breaks a quote.
exports.computeQuote = ({ cycle, channel, selections, itemsById, discountPercent, deliveryFeePerDay }) => {
  const days = CYCLE_DAYS[cycle];
  if (!days) {
    const err = new Error(`cycle must be one of ${Object.keys(CYCLE_DAYS).join(", ")}`);
    err.status = 400;
    throw err;
  }

  const lines = [];
  let dailyTotal = 0;
  for (const sel of selections || []) {
    for (const itemId of sel.itemIds || []) {
      const item = itemsById[itemId];
      if (!item) continue;
      dailyTotal += item.price;
      lines.push({ slot: sel.slot, itemId: item.id, name: item.name, price: item.price });
    }
  }

  const foodSubtotalBeforeDiscount = dailyTotal * days;
  // Rounded once, at the end of the discount step (decision I) — not per line,
  // so small per-item rounding never compounds into a visibly "off" total.
  const discountAmount = Math.round(foodSubtotalBeforeDiscount * ((discountPercent || 0) / 100));
  const foodSubtotal = foodSubtotalBeforeDiscount - discountAmount;
  // Delivery fee is a pass-through operational cost, not a product — it's
  // deliberately never discounted (decision, stated when the delivery-charge
  // gap was raised). Pickup subscriptions carry no delivery fee at all.
  const deliveryFeeTotal = channel === "delivery" ? Math.round((deliveryFeePerDay || 0) * days) : 0;
  const totalAmount = foodSubtotal + deliveryFeeTotal;

  return {
    cycle,
    days,
    dailyTotal,
    lines,
    foodSubtotalBeforeDiscount,
    discountPercent: discountPercent || 0,
    discountAmount,
    foodSubtotal,
    deliveryFeeTotal,
    totalAmount
  };
};
