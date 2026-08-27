import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

const CYCLE_LABEL = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const SLOT_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const STATUS_LABEL = { active: "Active", paused: "Paused", cancelled: "Cancelled" };

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

  const selectPlan = (id) => {
    setSelectedPlanId(id);
    setSelections({});
    setQuote(null);
    setSubscribeError(null);
    setJustSubscribed(null);
  };

  // Live quote — recomputes on every tap, debounced so a quick run of taps
  // doesn't fire a request per tap.
  useEffect(() => {
    if (!selectedPlan) return;
    const selArray = selectedPlan.mealSlots.map((slot) => ({ slot, itemIds: selections[slot] || [] }));
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
      const selArray = selectedPlan.mealSlots.map((slot) => ({ slot, itemIds: selections[slot] || [] }));
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
    <div className="page meal-plans-page">
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
            <p className="mp-plan-meta">{CYCLE_LABEL[plan.cycle]} · {plan.mealSlots.map((s) => SLOT_LABEL[s]).join(" + ")}</p>
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
              {selectedPlan.mealSlots.map((slot) => (
                <div key={slot} className="mp-slot">
                  <p className="mp-slot-title">
                    {SLOT_LABEL[slot]} <span className="mp-slot-count">{(selections[slot] || []).length}/{selectedPlan.maxItemsPerMeal}</span>
                  </p>
                  <div className="mp-item-chips">
                    {Object.entries(itemsByCategory).map(([cat, catItems]) => (
                      <div key={cat} className="mp-item-cat-group">
                        <span className="mp-item-cat-label">{cat}</span>
                        {catItems.map((item) => {
                          const picked = (selections[slot] || []).includes(item.id);
                          return (
                            <button
                              key={item.id}
                              className={`mp-item-chip${picked ? " picked" : ""}${!item.inStock ? " out" : ""}`}
                              disabled={!item.inStock}
                              onClick={() => toggleItem(slot, item.id)}
                            >
                              {item.name} — ₹{item.price}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

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
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="field-input">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </select>
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

        .mp-builder { margin-top: 26px; border-top: 1px solid var(--border); padding-top: 20px; }
        .mp-builder-layout { display: block; }
        @media (min-width: 860px) { .mp-builder-layout { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: start; } }

        .mp-slot { margin-bottom: 18px; }
        .mp-slot-title { font-size: 14px; font-weight: 600; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
        .mp-slot-count { font-size: 11px; font-weight: 400; color: var(--text-secondary); }
        .mp-item-cat-group { margin-bottom: 8px; }
        .mp-item-cat-label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin-bottom: 5px; }
        .mp-item-chips { }
        .mp-item-chip {
          display: inline-block; margin: 0 6px 6px 0; padding: 6px 12px; border-radius: 999px;
          border: 1px solid var(--border); background: var(--surface-1); font-size: 12.5px; color: var(--text-primary);
        }
        .mp-item-chip.picked { background: var(--green); color: var(--cream); border-color: var(--green); }
        .mp-item-chip.out { opacity: 0.5; text-decoration: line-through; }

        .mp-field-label { display: block; font-size: 11.5px; color: var(--text-secondary); margin: 4px 0 4px; }

        .mp-quote-panel { background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-top: 20px; }
        @media (min-width: 860px) { .mp-quote-panel { margin-top: 0; position: sticky; top: 20px; } }
        .mp-quote-title { font-size: 15px; margin: 0 0 10px; }
        .mp-quote-row { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--text-secondary); padding: 3px 0; }
        .mp-quote-row.mp-discount { color: var(--red); }
        .mp-quote-total { display: flex; justify-content: space-between; font-size: 17px; font-weight: 600; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); }
      `}</style>
    </div>
  );
}
