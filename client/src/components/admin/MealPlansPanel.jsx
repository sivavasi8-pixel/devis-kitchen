import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ListPanel, ListRow, StatGrid, StatCard } from "./AdminUI";

const CYCLES = ["daily", "weekly", "monthly"];
const CYCLE_LABEL = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const SLOTS = ["breakfast", "lunch", "dinner"];
const STATUS_LABEL = { active: "Active", paused: "Paused", cancelled: "Cancelled" };
const SLOT_ORDER = ["breakfast", "lunch", "dinner"];
const SLOT_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };

// sub.selections (once resolved by the server) is [{ slot, items: [{name}] }]
// — this is what actually answers "what did they pick", which the list used
// to have no way to show at all.
const selectionsLabel = (selections) =>
  [...(selections || [])]
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
    .map((sel) => `${SLOT_LABEL[sel.slot]}: ${sel.items.length ? sel.items.map((i) => i.name).join(", ") : "—"}`)
    .join(" · ");
const emptyPlanForm = { name: "", cycle: "weekly", mealSlots: ["lunch"], maxItemsPerMeal: 2 };

// The owner-facing half of meal subscriptions — plan shape (cycle, meal
// slots, item limit; deliberately no price field, see subscriptionPricing.js)
// plus the two global settings that actually drive pricing: discount per
// cycle length, and the flat per-day delivery fee.
export default function MealPlansPanel() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  // Subscribers is the default and only tab staff ever see — plan/pricing
  // setup is a rare, owner-only task, not the everyday reason anyone opens
  // this page. Staff gets no tab bar at all, just the subscriber list.
  const [activeTab, setActiveTab] = useState("subscribers");
  const [plans, setPlans] = useState(null);
  const [settings, setSettings] = useState(null);
  const [subscriptions, setSubscriptions] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [subActionId, setSubActionId] = useState(null);

  const [discountDrafts, setDiscountDrafts] = useState({});
  const [deliveryFeeDraft, setDeliveryFeeDraft] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(null);
  const [savingFee, setSavingFee] = useState(false);

  const [form, setForm] = useState(emptyPlanForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = () =>
    Promise.all([api.getAllSubscriptionPlans(), api.getSubscriptionSettings(), api.getAllSubscriptions()])
      .then(([p, s, subs]) => {
        setPlans(p.plans);
        setSettings(s);
        setDeliveryFeeDraft(String(s.deliveryFeePerDay));
        setSubscriptions(subs.subscriptions);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const saveDiscount = async (cycle) => {
    const raw = discountDrafts[cycle];
    if (raw === undefined || raw === "") return;
    setSavingDiscount(cycle);
    setActionError(null);
    try {
      const { discounts } = await api.updateSubscriptionDiscount(cycle, Number(raw));
      setSettings((s) => ({ ...s, discounts }));
      setDiscountDrafts((d) => ({ ...d, [cycle]: undefined }));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSavingDiscount(null);
    }
  };

  const saveDeliveryFee = async () => {
    if (deliveryFeeDraft === "") return;
    setSavingFee(true);
    setActionError(null);
    try {
      const { deliveryFeePerDay } = await api.updateSubscriptionDeliveryFee(Number(deliveryFeeDraft));
      setSettings((s) => ({ ...s, deliveryFeePerDay }));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSavingFee(false);
    }
  };

  const toggleActive = async (plan) => {
    setActionError(null);
    try {
      await api.updateSubscriptionPlan(plan.id, { isActive: !plan.isActive });
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const toggleSlot = (slot) => {
    setForm((f) => ({
      ...f,
      mealSlots: f.mealSlots.includes(slot) ? f.mealSlots.filter((s) => s !== slot) : [...f.mealSlots, slot]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (form.mealSlots.length === 0) {
      setFormError("Pick at least one meal slot");
      return;
    }
    setSaving(true);
    try {
      await api.createSubscriptionPlan({
        name: form.name,
        cycle: form.cycle,
        mealSlots: form.mealSlots,
        maxItemsPerMeal: Number(form.maxItemsPerMeal) || 2
      });
      setForm(emptyPlanForm);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changeSubStatus = async (sub, status) => {
    setSubActionId(sub.id);
    setActionError(null);
    try {
      await api.updateSubscriptionStatus(sub.id, status);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubActionId(null);
    }
  };

  // Was entirely missing — a cash subscription's paymentStatus was set once
  // at signup and had no way to ever change, unlike the equivalent "Mark
  // paid" action every regular order already has.
  const markSubPaid = async (sub) => {
    setSubActionId(sub.id);
    setActionError(null);
    try {
      await api.updateSubscriptionPayment(sub.id, "paid");
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubActionId(null);
    }
  };

  const handleDelete = async (plan) => {
    // Deleting fails outright if anyone (even a past/cancelled subscriber)
    // still references this plan — the server explains that clearly if it
    // happens, so this just needs to stop overpromising what delete does.
    if (!confirm(`Delete "${plan.name}"? This can't be undone.`)) return;
    setActionError(null);
    try {
      await api.deleteSubscriptionPlan(plan.id);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  if (error) return <p style={{ color: "var(--a-danger-text)" }}>Couldn't load meal plans: {error}</p>;
  if (!plans || !settings || !subscriptions) return <p style={{ color: "var(--a-text-secondary)" }}>Loading…</p>;

  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const recurringRevenue = activeSubs.reduce((sum, s) => sum + s.totalAmount, 0);

  return (
    <div>
      {actionError && <p style={{ fontSize: 13, color: "var(--a-danger-text)", marginBottom: 14 }}>{actionError}</p>}

      {isOwner && (
        <div className="mp-admin-tabs">
          <button
            className={`mp-admin-tab${activeTab === "subscribers" ? " active" : ""}`}
            onClick={() => setActiveTab("subscribers")}
          >
            Subscribers
          </button>
          <button
            className={`mp-admin-tab${activeTab === "plans" ? " active" : ""}`}
            onClick={() => setActiveTab("plans")}
          >
            Meal Plans
          </button>
        </div>
      )}

      {isOwner && activeTab === "plans" && (
      <>
      <div className="admin-two-col" style={{ marginBottom: 18 }}>
        <div className="admin-form-panel">
          <p className="admin-section-title">Discount per cycle length</p>
          <p className="mp-hint">Applied to every plan of that cycle. Changing a value only affects future subscriptions — never one already paid for.</p>
          {CYCLES.map((cycle) => (
            <div key={cycle} className="mp-tier-row">
              <span className="mp-tier-label">{CYCLE_LABEL[cycle]}</span>
              <input
                type="number" min="0" max="100" step="0.5" className="admin-search mp-tier-input"
                placeholder={`${settings.discounts[cycle]}%`}
                value={discountDrafts[cycle] ?? ""}
                onChange={(e) => setDiscountDrafts((d) => ({ ...d, [cycle]: e.target.value }))}
              />
              <span className="mp-tier-current">currently {settings.discounts[cycle]}%</span>
              <button onClick={() => saveDiscount(cycle)} disabled={savingDiscount === cycle} className="admin-btn-xs">
                {savingDiscount === cycle ? "…" : "Save"}
              </button>
            </div>
          ))}
        </div>

        <div className="admin-form-panel">
          <p className="admin-section-title">Delivery fee</p>
          <p className="mp-hint">A flat per-day charge for delivery subscriptions (× the cycle's days). Never discounted — it's a pass-through cost, not a menu item. Pickup subscriptions pay none.</p>
          <div className="mp-tier-row">
            <span className="mp-tier-label">Per day</span>
            <input
              type="number" min="0" step="1" className="admin-search mp-tier-input"
              placeholder={`₹${settings.deliveryFeePerDay}`}
              value={deliveryFeeDraft}
              onChange={(e) => setDeliveryFeeDraft(e.target.value)}
            />
            <span className="mp-tier-current">currently ₹{settings.deliveryFeePerDay}</span>
            <button onClick={saveDeliveryFee} disabled={savingFee} className="admin-btn-xs">
              {savingFee ? "…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      <div className="admin-two-col" style={{ marginBottom: 20 }}>
        <div>
          <p className="admin-section-title">Plans</p>
          <ListPanel>
            {plans.length === 0 && (
              <p style={{ padding: 14, fontSize: 13, color: "var(--a-text-secondary)" }}>No plans yet — add one on the right.</p>
            )}
            {plans.map((plan) => (
              <ListRow key={plan.id}>
                <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                  <p style={{ margin: 0, fontSize: 13 }}>{plan.name}</p>
                  <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>
                    {CYCLE_LABEL[plan.cycle]} · {plan.mealSlots.join(" + ")} · up to {plan.maxItemsPerMeal} items/meal
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => toggleActive(plan)} className={`mp-plan-toggle${plan.isActive ? " on" : ""}`}>
                    {plan.isActive ? "Active" : "Inactive"}
                  </button>
                  <button onClick={() => handleDelete(plan)} className="admin-btn-xs danger">Delete</button>
                </div>
              </ListRow>
            ))}
          </ListPanel>
        </div>

        <form onSubmit={handleSubmit} className="admin-form-panel">
          <p className="admin-section-title">Add a plan</p>
          <input
            className="admin-search" placeholder='Name (e.g. "Lunch + Dinner — Weekly")'
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={{ marginBottom: 8 }} required
          />
          <select className="admin-search" value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })} style={{ marginBottom: 8 }}>
            {CYCLES.map((c) => <option key={c} value={c}>{CYCLE_LABEL[c]}</option>)}
          </select>
          <label className="mp-field-label">Meal slots</label>
          <div className="mp-slot-checks">
            {SLOTS.map((slot) => (
              <label key={slot} className="checkbox-label">
                <input type="checkbox" checked={form.mealSlots.includes(slot)} onChange={() => toggleSlot(slot)} />
                {slot[0].toUpperCase() + slot.slice(1)}
              </label>
            ))}
          </div>
          <label className="mp-field-label">Max items per meal</label>
          <input
            type="number" min="1" step="1" className="admin-search"
            value={form.maxItemsPerMeal} onChange={(e) => setForm({ ...form, maxItemsPerMeal: e.target.value })}
            style={{ marginBottom: 10 }}
          />
          {formError && <p style={{ fontSize: 12, color: "var(--a-danger-text)", marginBottom: 10 }}>{formError}</p>}
          <button type="submit" disabled={saving} className="admin-btn-primary">
            {saving ? "Adding…" : "Add plan"}
          </button>
        </form>
      </div>
      </>
      )}

      {(!isOwner || activeTab === "subscribers") && (
      <>
      <StatGrid columns={3}>
        <StatCard label="Active subscriptions" value={activeSubs.length} />
        <StatCard label="Recurring revenue" value={`₹${recurringRevenue.toLocaleString()}`} sub="per cycle, active only" />
        <StatCard label="Total ever subscribed" value={subscriptions.length} />
      </StatGrid>

      <ListPanel>
        {subscriptions.length === 0 && (
          <p style={{ padding: 14, fontSize: 13, color: "var(--a-text-secondary)" }}>No one has subscribed yet.</p>
        )}
        {subscriptions.map((sub) => (
          <ListRow key={sub.id}>
            <div style={{ minWidth: 0, flex: "1 1 220px" }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                {sub.customerName} <span style={{ color: "var(--a-text-secondary)", fontWeight: 400 }}>· {sub.planName}</span>
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>
                {selectionsLabel(sub.selections)}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>
                {sub.channel === "delivery" ? `Delivery — ${sub.deliveryAddress}${sub.deliveryPhone ? ` · ${sub.deliveryPhone}` : ""}` : "Pickup"}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--a-text-muted)" }}>
                ₹{sub.totalAmount} / cycle · {sub.paymentStatus === "paid" ? "Paid" : "Pay in person"} ({sub.paymentMethod})
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              <span className={`mp-sub-status mp-sub-status-${sub.status}`}>{STATUS_LABEL[sub.status]}</span>
              {sub.paymentStatus !== "paid" && (
                <button onClick={() => markSubPaid(sub)} disabled={subActionId === sub.id} className="admin-btn-xs">
                  {subActionId === sub.id ? "…" : "Mark paid"}
                </button>
              )}
              {sub.status === "active" && (
                <button onClick={() => changeSubStatus(sub, "paused")} disabled={subActionId === sub.id} className="admin-btn-xs">Pause</button>
              )}
              {sub.status === "paused" && (
                <button onClick={() => changeSubStatus(sub, "active")} disabled={subActionId === sub.id} className="admin-btn-xs">Resume</button>
              )}
              {sub.status !== "cancelled" && (
                <button
                  onClick={() => { if (confirm(`Cancel ${sub.customerName}'s subscription?`)) changeSubStatus(sub, "cancelled"); }}
                  disabled={subActionId === sub.id}
                  className="admin-btn-xs danger"
                >
                  Cancel
                </button>
              )}
            </div>
          </ListRow>
        ))}
      </ListPanel>
      </>
      )}

      <style>{`
        /* This component used to only ever render nested inside MenuAdmin.jsx,
           which happened to define all six of these classes in its own <style>
           block — none of them are real globals in admin-theme.css. Now that
           this is its own top-level page, they have to be defined here too, or
           every input/button/panel on this page renders as unstyled browser
           defaults (exactly what produced the broken "Add a plan" layout).
           Values copied verbatim from MenuAdmin.jsx so this still matches the
           rest of the admin UI. */
        .admin-section-title { font-size: 14px; font-weight: 500; margin-bottom: 10px; }
        .admin-two-col { display: grid; grid-template-columns: 1fr; gap: 18px; }
        @media (min-width: 900px) { .admin-two-col { grid-template-columns: 1.5fr 1fr; } }
        .admin-search { width: 100%; border: 1px solid var(--a-border); border-radius: 6px; padding: 8px 12px; font-size: 13px; font-family: var(--font-body); box-sizing: border-box; display: block; }
        .admin-form-panel { background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius); padding: 16px; align-self: start; }
        .admin-btn-primary { padding: 10px; background: var(--a-green); color: #fff; border: none; border-radius: 6px; font-size: 13px; width: 100%; box-sizing: border-box; }
        .admin-btn-xs { border: 1px solid var(--a-border); background: var(--a-panel); border-radius: 6px; padding: 5px 10px; font-size: 11.5px; white-space: nowrap; color: var(--a-text-secondary); }
        .admin-btn-xs.danger { color: var(--a-danger-text); }

        .mp-admin-tabs { display: flex; gap: 6px; margin-bottom: 18px; border-bottom: 1px solid var(--a-border); }
        .mp-admin-tab {
          border: none; background: none; padding: 9px 4px; margin-right: 18px; font-size: 13.5px;
          font-weight: 500; color: var(--a-text-secondary); border-bottom: 2px solid transparent; margin-bottom: -1px;
        }
        .mp-admin-tab.active { color: var(--a-text-primary); border-bottom-color: var(--a-green); }
        .mp-hint { font-size: 11.5px; color: var(--a-text-secondary); margin: 0 0 12px; }
        .mp-tier-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
        .mp-tier-row:last-child { margin-bottom: 0; }
        .mp-tier-label { width: 60px; font-size: 12.5px; font-weight: 500; flex-shrink: 0; }
        .mp-tier-input { width: 80px; flex: 0 0 auto; }
        .mp-tier-current { font-size: 11px; color: var(--a-text-muted); flex: 1; }
        .mp-field-label { display: block; font-size: 11.5px; color: var(--a-text-secondary); margin: 0 0 6px; }
        .mp-slot-checks { display: flex; gap: 12px; margin-bottom: 10px; }
        .checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--a-text-primary); }
        .mp-plan-toggle {
          border: 1px solid var(--a-border); background: var(--a-panel); color: var(--a-text-secondary);
          border-radius: 999px; padding: 4px 10px; font-size: 10.5px; font-weight: 600; white-space: nowrap;
        }
        .mp-plan-toggle.on { border-color: var(--a-green); background: var(--a-green); color: #fff; }
        .mp-sub-status { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 8px; border-radius: 999px; }
        .mp-sub-status-active { background: var(--a-success-bg); color: var(--a-success-text); }
        .mp-sub-status-paused { background: var(--a-warning-bg); color: var(--a-warning-text); }
        .mp-sub-status-cancelled { background: var(--a-bg); color: var(--a-text-muted); }
      `}</style>
    </div>
  );
}
