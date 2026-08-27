import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

const CYCLE_LABEL = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const SLOT_ORDER = ["breakfast", "lunch", "dinner"];
const SLOT_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const SLOT_ICON = { breakfast: "🌅", lunch: "☀️", dinner: "🌙" };
const STATUS_LABEL = { active: "Active", paused: "Paused", cancelled: "Cancelled" };

// Defensive — a plan created before this was fixed server-side may still have
// slots stored out of order; this keeps the display correct either way.
const orderedSlots = (slots) => [...slots].sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));

// sub.selections (resolved server-side) is [{ slot, items: [{name}] }] — what
// was actually picked, so "My subscriptions" isn't just a plan name + price.
const selectionsLabel = (selections) =>
  orderedSlots((selections || []).map((s) => s.slot))
    .map((slot) => {
      const sel = selections.find((s) => s.slot === slot);
      return `${SLOT_LABEL[slot]}: ${sel.items.length ? sel.items.map((i) => i.name).join(", ") : "—"}`;
    })
    .join(" · ");

export default function MealPlans() {
  const { user } = useAuth();
  const canSubscribe = user && user.role === "customer";

  const [plans, setPlans] = useState(null);
  const [items, setItems] = useState(null);
  const [mySubs, setMySubs] = useState(null);
  const [error, setError] = useState(null);

  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [channel, setChannel] = useState("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [selections, setSelections] = useState({}); // { [slot]: [itemId, ...] }
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);

  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState(null);
  const [justSubscribed, setJustSubscribed] = useState(null);

  useEffect(() => {
    api.getSubscriptionPlans().then((d) => setPlans(d.plans)).catch((e) => setError(e.message));
    api.getSubscriptionEligibleItems().then((d) => setItems(d.items)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!canSubscribe) return;
    api.getMySubscriptions().then((d) => setMySubs(d.subscriptions)).catch(() => {});
  }, [canSubscribe]);

  const selectedPlan = plans && plans.find((p) => p.id === selectedPlanId);
  const selectedSlots = selectedPlan ? orderedSlots(selectedPlan.mealSlots) : [];
  const [activeSlot, setActiveSlot] = useState(null);

  const selectPlan = (id) => {
    setSelectedPlanId(id);
    setSelections({});
    setQuote(null);
    setSubscribeError(null);
    setJustSubscribed(null);
    const plan = plans.find((p) => p.id === id);
    setActiveSlot(plan ? orderedSlots(plan.mealSlots)[0] : null);
  };

  // Live quote — recomputes on every tap, debounced so a quick run of taps
  // doesn't fire a request per tap.
  useEffect(() => {
    if (!selectedPlan) return;
    const selArray = selectedSlots.map((slot) => ({ slot, itemIds: selections[slot] || [] }));
    if (!selArray.some((s) => s.itemIds.length > 0)) {
      setQuote(null);
      return;
    }
    setQuoteError(null);
    const t = setTimeout(() => {
      api
        .getSubscriptionQuote({ planId: selectedPlan.id, channel, selections: selArray })
        .then((d) => setQuote(d.quote))
        .catch((e) => setQuoteError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [selections, channel, selectedPlan]);

  const toggleItem = (slot, itemId) => {
    setSelections((prev) => {
      const current = prev[slot] || [];
      if (current.includes(itemId)) return { ...prev, [slot]: current.filter((id) => id !== itemId) };
      if (current.length >= selectedPlan.maxItemsPerMeal) return prev; // at the limit — tap one off first
      return { ...prev, [slot]: [...current, itemId] };
    });
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) return;
    setSubscribeError(null);
    if (channel === "delivery" && !deliveryAddress.trim()) {
      setSubscribeError("Please enter a delivery address");
      return;
    }
    setSubscribing(true);
    try {
      const selArray = selectedSlots.map((slot) => ({ slot, itemIds: selections[slot] || [] }));
      const { subscription } = await api.createSubscription({
        planId: selectedPlan.id,
        channel,
        selections: selArray,
        deliveryAddress: channel === "delivery" ? deliveryAddress : undefined,
        deliveryPhone: channel === "delivery" ? deliveryPhone : undefined,
        paymentMethod
      });
      setJustSubscribed(subscription);
      setSelectedPlanId(null);
      const d = await api.getMySubscriptions();
      setMySubs(d.subscriptions);
    } catch (err) {
      setSubscribeError(err.message);
    } finally {
      setSubscribing(false);
    }
  };

  const changeStatus = async (sub, status) => {
    try {
      await api.updateSubscriptionStatus(sub.id, status);
      const d = await api.getMySubscriptions();
      setMySubs(d.subscriptions);
    } catch (e) {
      setError(e.message);
    }
  };

  if (error) return <p style={{ padding: 28, color: "var(--red)" }}>Couldn't load meal plans: {error}</p>;
  if (!plans || !items) return <p style={{ padding: 28, color: "var(--text-secondary)" }}>Loading…</p>;

  const itemsByCategory = {};
  items.forEach((it) => {
    if (!itemsByCategory[it.category]) itemsByCategory[it.category] = [];
    itemsByCategory[it.category].push(it);
  });

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">📅 Subscribe &amp; save</span>
          <h1 className="hero-title">Build your own meal plan</h1>
          <p className="hero-sub">Pick what you want to eat, the price calculates itself — daily, weekly, or monthly.</p>
        </div>
      </div>

      {justSubscribed && (
        <div className="mp-confirm">
          <p className="mp-confirm-title">✅ You're subscribed!</p>
          <p className="mp-confirm-meta">
            Total for this cycle: ₹{justSubscribed.totalAmount} · {justSubscribed.paymentStatus === "paid" ? "Paid" : "Pay in person"}
          </p>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>
            You can manage it any time below — pause, resume, or cancel.
          </p>
        </div>
      )}

      {canSubscribe && mySubs && mySubs.length > 0 && (
        <div className="mp-my-subs">
          <h2 className="section-title">My subscriptions</h2>
          {mySubs.map((s) => (
            <div key={s.id} className="mp-sub-card">
              <div className="mp-sub-main">
                <p className="mp-sub-name">{s.planName} <span className={`mp-status mp-status-${s.status}`}>{STATUS_LABEL[s.status]}</span></p>
                <p className="mp-sub-meta">{selectionsLabel(s.selections)}</p>
                <p className="mp-sub-meta">
                  {s.channel === "delivery" ? "Delivery" : "Pickup"} · ₹{s.totalAmount} / cycle · {s.paymentStatus === "paid" ? "Paid" : "Pay in person"}
                </p>
              </div>
              <div className="mp-sub-actions">
                {s.status === "active" && <button onClick={() => changeStatus(s, "paused")} className="mp-btn-outline">Pause</button>}
                {s.status === "paused" && <button onClick={() => changeStatus(s, "active")} className="mp-btn-outline">Resume</button>}
                {s.status !== "cancelled" && (
                  <button
                    onClick={() => { if (confirm("Cancel this subscription?")) changeStatus(s, "cancelled"); }}
                    className="mp-btn-outline mp-btn-danger"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title">Available plans</h2>
      <div className="mp-plan-grid">
        {plans.map((plan) => (
          <button
            key={plan.id}
            className={`mp-plan-card${selectedPlanId === plan.id ? " selected" : ""}`}
            onClick={() => selectPlan(plan.id)}
          >
            <p className="mp-plan-name">{plan.name}</p>
            <p className="mp-plan-meta">{CYCLE_LABEL[plan.cycle]} · {orderedSlots(plan.mealSlots).map((s) => SLOT_LABEL[s]).join(" + ")}</p>
            <p className="mp-plan-limit">Up to {plan.maxItemsPerMeal} items per meal</p>
          </button>
        ))}
        {plans.length === 0 && <p className="empty-note">No plans available right now — check back soon.</p>}
      </div>

      {selectedPlan && (
        <div className="mp-builder">
          <h2 className="section-title">Build "{selectedPlan.name}"</h2>

          <div className="mp-builder-layout">
            <div className="mp-slots">
              {/* One meal at a time, in a fixed breakfast → lunch → dinner order — showing
                  the full item catalog three times stacked on top of each other was the
                  actual problem with the old layout, not just how the chips looked. */}
              <div className="mp-slot-tabs">
                {selectedSlots.map((slot) => (
                  <button
                    key={slot}
                    className={`mp-slot-tab${activeSlot === slot ? " active" : ""}`}
                    onClick={() => setActiveSlot(slot)}
                  >
                    <span className="mp-slot-tab-icon">{SLOT_ICON[slot]}</span>
                    {SLOT_LABEL[slot]}
                    <span className="mp-slot-tab-count">{(selections[slot] || []).length}/{selectedPlan.maxItemsPerMeal}</span>
                  </button>
                ))}
              </div>

              {activeSlot && (
                <div className="mp-slot-card">
                  {Object.entries(itemsByCategory).map(([cat, catItems]) => (
                    <div key={cat} className="mp-item-cat-group">
                      <span className="mp-item-cat-label">{cat}</span>
                      <div className="mp-item-chip-row">
                        {catItems.map((item) => {
                          const picked = (selections[activeSlot] || []).includes(item.id);
                          return (
                            <button
                              key={item.id}
                              className={`mp-item-chip${picked ? " picked" : ""}${!item.inStock ? " out" : ""}`}
                              disabled={!item.inStock}
                              onClick={() => toggleItem(activeSlot, item.id)}
                            >
                              {picked && <span className="mp-item-check">✓</span>}
                              {item.name}
                              <span className="mp-item-chip-price">₹{item.price}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mp-delivery-card">
                <label className="mp-field-label">How you'll get it</label>
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className="field-input">
                  <option value="delivery">Delivery</option>
                  <option value="pickup">Pickup</option>
                </select>
                {channel === "delivery" && (
                  <>
                    <textarea
                      placeholder="Delivery address" value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)} className="field-input" rows={2}
                    />
                    <input
                      type="text" placeholder="Phone (optional)" value={deliveryPhone}
                      onChange={(e) => setDeliveryPhone(e.target.value)} className="field-input"
                    />
                  </>
                )}
                <label className="mp-field-label">Payment</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="field-input" style={{ marginBottom: 0 }}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                </select>
              </div>
            </div>

            <aside className="mp-quote-panel">
              <h3 className="mp-quote-title">Your total</h3>
              {!quote && <p className="empty-note">Pick items above to see your price.</p>}
              {quoteError && <p className="checkout-error">{quoteError}</p>}
              {quote && (
                <>
                  <div className="mp-quote-row"><span>Per day</span><span>₹{quote.dailyTotal}</span></div>
                  <div className="mp-quote-row"><span>× {quote.days} day{quote.days > 1 ? "s" : ""} ({CYCLE_LABEL[quote.cycle]})</span><span>₹{quote.foodSubtotalBeforeDiscount}</span></div>
                  {quote.discountPercent > 0 && (
                    <div className="mp-quote-row mp-discount"><span>Discount ({quote.discountPercent}%)</span><span>−₹{quote.discountAmount}</span></div>
                  )}
                  {quote.deliveryFeeTotal > 0 && (
                    <div className="mp-quote-row"><span>Delivery fee</span><span>₹{quote.deliveryFeeTotal}</span></div>
                  )}
                  <div className="mp-quote-total"><span>Total</span><span>₹{quote.totalAmount}</span></div>
                </>
              )}

              {subscribeError && <p className="checkout-error">{subscribeError}</p>}

              {canSubscribe ? (
                <button onClick={handleSubscribe} disabled={!quote || subscribing} className="btn-checkout">
                  {subscribing ? "Subscribing…" : "Subscribe & pay"}
                </button>
              ) : (
                <p className="login-prompt">
                  <Link to="/login" state={{ from: "/meal-plans" }}>Log in</Link>{" "}or{" "}
                  <Link to="/signup">create an account</Link> to subscribe.
                </p>
              )}
            </aside>
          </div>
        </div>
      )}

      <style>{`
        .hero {
          margin-bottom: 16px; border-radius: var(--radius-lg); overflow: hidden; position: relative;
          min-height: 110px; display: flex; align-items: center;
          background: radial-gradient(120% 140% at 15% 20%, rgba(201,138,46,0.5), transparent 55%), linear-gradient(120deg, #4a2f1a, #241811 60%, #16110c);
        }
        .hero-copy { position: relative; z-index: 1; padding: 20px 22px; color: var(--cream); }
        .hero-eyebrow { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; background: rgba(250,248,243,0.16); border: 1px solid rgba(250,248,243,0.3); padding: 3px 10px; border-radius: 999px; margin-bottom: 10px; }
        .hero-title { font-size: 24px; margin: 0 0 5px; line-height: 1.15; color: var(--cream); }
        .hero-sub { font-size: 12.5px; opacity: 0.85; margin: 0; }

        .section-title { font-size: 17px; margin: 22px 0 12px; }
        .empty-note { font-size: 13px; color: var(--text-secondary); }
        .checkout-error { font-size: 12px; color: var(--red); margin: 8px 0; }
        .login-prompt { font-size: 12px; color: var(--text-secondary); margin-top: 10px; }
        .login-prompt a { color: var(--green); }

        .mp-confirm { background: var(--green-tint); border: 1px solid var(--green); border-radius: var(--radius-lg); padding: 16px 18px; margin-bottom: 18px; }
        .mp-confirm-title { margin: 0 0 4px; font-weight: 600; }
        .mp-confirm-meta { margin: 0 0 6px; font-size: 13px; }

        .mp-my-subs { margin-bottom: 8px; }
        .mp-sub-card { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 12px 16px; margin-bottom: 8px; background: var(--surface-1); }
        .mp-sub-main { min-width: 0; flex: 1 1 220px; }
        .mp-sub-name { margin: 0; font-size: 13.5px; font-weight: 500; display: flex; align-items: center; gap: 8px; }
        .mp-sub-meta { margin: 3px 0 0; font-size: 12px; color: var(--text-secondary); }
        .mp-status { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 8px; border-radius: 999px; }
        .mp-status-active { background: var(--green-tint); color: var(--green); }
        .mp-status-paused { background: #f6ecd7; color: #8a6415; }
        .mp-status-cancelled { background: var(--surface-2); color: var(--text-muted); }
        .mp-sub-actions { display: flex; gap: 8px; }
        .mp-btn-outline { border: 1px solid var(--border-strong); background: var(--surface-1); border-radius: 8px; padding: 6px 12px; font-size: 12px; }
        .mp-btn-danger { color: var(--red); border-color: var(--red); }

        .mp-plan-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 620px) { .mp-plan-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 900px) { .mp-plan-grid { grid-template-columns: repeat(3, 1fr); } }
        .mp-plan-card {
          text-align: left; border: 1.5px solid var(--border); border-radius: var(--radius-lg); padding: 16px 18px;
          background: var(--surface-1); cursor: pointer; transition: border-color .12s ease, transform .1s ease;
        }
        .mp-plan-card:hover { border-color: var(--border-strong); }
        .mp-plan-card.selected { border-color: var(--gold); background: var(--surface-1); box-shadow: 0 0 0 1px var(--gold); }
        .mp-plan-name { font-family: var(--font-display); font-weight: 700; font-size: 15px; margin: 0 0 4px; }
        .mp-plan-meta { font-size: 12.5px; color: var(--text-secondary); margin: 0 0 4px; }
        .mp-plan-limit { font-size: 11.5px; color: var(--text-muted); margin: 0; }

        .mp-builder { margin-top: 30px; border-top: 1px solid var(--border); padding-top: 22px; }
        .mp-builder-layout { display: block; }
        @media (min-width: 860px) { .mp-builder-layout { display: grid; grid-template-columns: 1.4fr 1fr; gap: 22px; align-items: start; } }
        .mp-slots { min-width: 0; }

        .mp-slot-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
        .mp-slot-tab {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
          padding: 11px 10px; border-radius: var(--radius); border: 1.5px solid var(--border);
          background: var(--surface-1); font-size: 13px; font-weight: 500; color: var(--text-secondary);
          transition: border-color .12s ease, background .12s ease, color .12s ease;
        }
        .mp-slot-tab-icon { font-size: 15px; }
        .mp-slot-tab-count { font-size: 10.5px; color: var(--text-muted); }
        .mp-slot-tab.active { border-color: var(--green); background: var(--green); color: var(--cream); }
        .mp-slot-tab.active .mp-slot-tab-count { color: rgba(250,248,243,0.75); }

        .mp-slot-card {
          background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius-lg);
          padding: 16px 18px; margin-bottom: 16px;
        }
        .mp-item-cat-group { margin-bottom: 14px; }
        .mp-item-cat-group:last-child { margin-bottom: 0; }
        .mp-item-cat-label { display: block; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--gold); margin-bottom: 8px; }
        .mp-item-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .mp-item-chip {
          display: inline-flex; align-items: center; gap: 6px; padding: 7px 8px 7px 14px; border-radius: 999px;
          border: 1.5px solid var(--border); background: var(--surface-0); font-size: 12.5px; color: var(--text-primary);
          transition: border-color .12s ease, background .12s ease, transform .1s ease;
        }
        .mp-item-chip:hover:not(.out) { border-color: var(--border-strong); }
        .mp-item-chip:active:not(.out) { transform: scale(0.97); }
        .mp-item-chip-price { color: var(--text-secondary); font-size: 11.5px; background: var(--surface-2); padding: 2px 8px; border-radius: 999px; }
        .mp-item-chip.picked { background: var(--green); color: var(--cream); border-color: var(--green); }
        .mp-item-chip.picked .mp-item-chip-price { background: rgba(250,248,243,0.18); color: var(--cream); }
        .mp-item-check { font-size: 11px; font-weight: 700; }
        .mp-item-chip.out { opacity: 0.45; text-decoration: line-through; }

        .mp-delivery-card { background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px 18px; }
        .mp-field-label { display: block; font-size: 11.5px; color: var(--text-secondary); margin: 4px 0 4px; }
        /* Every element that takes className="field-input" on this page needs this —
           it's page-local in Order.jsx, not a real global class, so it has to be
           redefined here too or these render as unstyled, inline browser defaults
           (which is exactly what produced the broken-looking delivery section). */
        .field-input {
          width: 100%; padding: 8px 10px; font-size: 13px; border: 1px solid var(--border);
          border-radius: 8px; margin-bottom: 10px; box-sizing: border-box; font-family: var(--font-body);
          resize: vertical; display: block;
        }

        .mp-quote-panel {
          background: var(--surface-1); border: 1.5px solid var(--gold); border-radius: var(--radius-lg);
          padding: 18px; margin-top: 20px; box-shadow: 0 4px 18px -8px rgba(0,0,0,0.15);
        }
        @media (min-width: 860px) { .mp-quote-panel { margin-top: 0; position: sticky; top: 20px; } }
        .mp-quote-title { font-family: var(--font-display); font-size: 16px; margin: 0 0 12px; }
        .mp-quote-row { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--text-secondary); padding: 4px 0; }
        .mp-quote-row.mp-discount { color: var(--red); }
        .mp-quote-total {
          display: flex; justify-content: space-between; align-items: baseline; font-family: var(--font-display);
          font-size: 20px; font-weight: 700; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border);
        }
        .btn-checkout {
          width: 100%; padding: 10px; font-size: 13px; border: none; border-radius: 8px;
          background: var(--green); color: var(--cream); font-weight: 500; box-sizing: border-box; margin-top: 14px;
        }
        .btn-checkout:disabled { background: var(--surface-2); color: var(--text-muted); }
      `}</style>
    </div>
  );
}
