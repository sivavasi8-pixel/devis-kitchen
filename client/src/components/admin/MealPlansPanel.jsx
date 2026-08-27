import { useEffect, useState } from "react";
import { api } from "../../api";
import { ListPanel, ListRow } from "./AdminUI";

const CYCLES = ["daily", "weekly", "monthly"];
const CYCLE_LABEL = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const SLOTS = ["breakfast", "lunch", "dinner"];
const emptyPlanForm = { name: "", cycle: "weekly", mealSlots: ["lunch"], maxItemsPerMeal: 2 };

// The owner-facing half of meal subscriptions — plan shape (cycle, meal
// slots, item limit; deliberately no price field, see subscriptionPricing.js)
// plus the two global settings that actually drive pricing: discount per
// cycle length, and the flat per-day delivery fee.
export default function MealPlansPanel() {
  const [plans, setPlans] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [discountDrafts, setDiscountDrafts] = useState({});
  const [deliveryFeeDraft, setDeliveryFeeDraft] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(null);
  const [savingFee, setSavingFee] = useState(false);

  const [form, setForm] = useState(emptyPlanForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = () =>
    Promise.all([api.getAllSubscriptionPlans(), api.getSubscriptionSettings()])
      .then(([p, s]) => {
        setPlans(p.plans);
        setSettings(s);
        setDeliveryFeeDraft(String(s.deliveryFeePerDay));
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

  const handleDelete = async (plan) => {
    if (!confirm(`Delete "${plan.name}"? This won't affect anyone already subscribed.`)) return;
    setActionError(null);
    try {
      await api.deleteSubscriptionPlan(plan.id);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  if (error) return <p style={{ color: "var(--a-danger-text)" }}>Couldn't load meal plans: {error}</p>;
  if (!plans || !settings) return <p style={{ color: "var(--a-text-secondary)" }}>Loading…</p>;

  return (
    <div>
      {actionError && <p style={{ fontSize: 13, color: "var(--a-danger-text)", marginBottom: 14 }}>{actionError}</p>}

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

      <div className="admin-two-col">
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

      <style>{`
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
      `}</style>
    </div>
  );
}
