import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { AdminPage } from "../components/admin/AdminUI";

// Curated labels for known categories; anything else (a brand-new category
// added in Menu admin) still gets a tab here automatically, just titled from
// its raw name — matches how Order.jsx derives its own customer-facing tabs,
// so a walk-in sale never loses access to a category the moment it's renamed.
const CATEGORY_LABELS = { mains: "Mains", breads: "Breads", starters: "Starters", desserts: "Desserts", beverages: "Beverages" };
const BASE_CATEGORY_ORDER = ["mains", "breads", "starters", "desserts", "beverages"];
const ALL = "__all";

const paymentOptions = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" }
];
const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function AdminPos() {
  const [menu, setMenu] = useState(null);
  const [activeCategory, setActiveCategory] = useState(ALL);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [channel, setChannel] = useState("pickup"); // a counter sale is pickup or dine-in; delivery goes through the Order page
  const [tableNumber, setTableNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [error, setError] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);

  useEffect(() => {
    api.getMenu().then((d) => setMenu(d.items)).catch((e) => setError(e.message));
  }, []);

  // Real, current categories only — excludes "custom" (made-to-order by weight, needs the
  // dedicated form on the Order page). "special" items are rung up from "All items".
  const categories = useMemo(() => {
    if (!menu) return [];
    const present = new Set(menu.map((m) => m.category));
    present.delete("custom");
    present.delete("special");
    const ordered = BASE_CATEGORY_ORDER.filter((c) => present.has(c));
    present.forEach((c) => { if (!ordered.includes(c)) ordered.push(c); });
    return [
      { id: ALL, label: "All items" },
      ...ordered.map((id) => ({ id, label: CATEGORY_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1) }))
    ];
  }, [menu]);

  const changeQty = (item, delta) => {
    if (delta > 0 && !item.inStock) return;
    setPlacedOrder(null);
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (!existing) return delta > 0 ? [...prev, { ...item, qty: 1 }] : prev;
      const qty = existing.qty + delta;
      return qty > 0 ? prev.map((c) => (c.id === item.id ? { ...c, qty } : c)) : prev.filter((c) => c.id !== item.id);
    });
  };

  const toggleAvailability = async (item) => {
    try {
      await api.updateMenuAvailability(item.id, !item.inStock);
      const d = await api.getMenu();
      setMenu(d.items);
    } catch (err) {
      setError(err.message);
    }
  };

  // Display only — the server prices every line from the menu.
  const total = cart.reduce((sum, c) => sum + (c.price || 0) * c.qty, 0);

  const handleCharge = async () => {
    setError(null);
    setPlacing(true);
    try {
      const order = await api.createOrder({
        items: cart.map((c) => ({ menuItemId: c.id, name: c.name, qty: c.qty })),
        customerName: customerName || "Walk-in",
        channel,
        tableNumber: channel === "dine_in" ? tableNumber.trim() || undefined : undefined,
        paymentMethod
      });
      setPlacedOrder(order.order);
      setCart([]);
      setCustomerName("");
      setTableNumber("");
      setPaymentMethod("cash");
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  };

  if (error && !menu) return <AdminPage title="Counter sale"><p style={{ color: "var(--a-danger-text)" }}>Couldn't load the menu: {error}. Refresh to try again.</p></AdminPage>;
  if (!menu) return <AdminPage title="Counter sale"><p style={{ color: "var(--a-text-secondary)" }}>Loading…</p></AdminPage>;

  const sellable = menu.filter((m) => m.price && m.category !== "custom");
  const shown = activeCategory === ALL ? sellable : sellable.filter((m) => m.category === activeCategory);
  const qtyOf = (id) => cart.find((c) => c.id === id)?.qty || 0;
  const payLabel = paymentOptions.find((p) => p.id === paymentMethod)?.label;

  return (
    <AdminPage eyebrow="Ring up a walk-in or dine-in sale" title="Counter sale">
      <div className="pos">
        <div className="pos-menu">
          <div className="pos-tabs" role="tablist" aria-label="Categories">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === c.id}
                className={`pos-tab${activeCategory === c.id ? " on" : ""}`}
                onClick={() => setActiveCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="pos-grid">
            {shown.map((item) => {
              const qty = qtyOf(item.id);
              return (
                <div key={item.id} className={`pos-tile${!item.inStock ? " out" : ""}${qty ? " picked" : ""}`}>
                  <button
                    type="button"
                    className="pos-tile-btn"
                    onClick={() => changeQty(item, 1)}
                    disabled={!item.inStock}
                    aria-label={item.inStock ? `Add ${item.name}, ${money(item.price)}` : `${item.name} is sold out`}
                  >
                    <span className="pos-tile-name">{item.name}</span>
                    <span className="pos-tile-foot">
                      <span className="pos-tile-price">{money(item.price)}</span>
                      {!item.inStock ? <span className="pos-sold">Sold out</span> : qty ? <span className="pos-badge">{qty}</span> : null}
                    </span>
                  </button>
                  <button type="button" onClick={() => toggleAvailability(item)} className="pos-avail">
                    {item.inStock ? "Mark sold out" : "Mark available"}
                  </button>
                </div>
              );
            })}
            {shown.length === 0 && <p className="pos-empty">Nothing in this category.</p>}
          </div>
        </div>

        <aside className="pos-sale" aria-labelledby="sale-heading">
          <div className="pos-sale-head">
            <h2 id="sale-heading">Current sale</h2>
            {cart.length > 0 && <button type="button" className="pos-clear" onClick={() => setCart([])}>Clear</button>}
          </div>

          {placedOrder && (
            <div className="pos-done" role="status">
              <p><b>Order #{placedOrder.id}</b> rung up · {money(placedOrder.total)} · {placedOrder.paymentMethod}</p>
              <Link to={`/receipt/${placedOrder.id}`} className="a-btn quiet">Print receipt</Link>
            </div>
          )}

          <div className="pos-pay" role="radiogroup" aria-label="Order type" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            {[{ id: "pickup", label: "Pickup" }, { id: "dine_in", label: "Dine-in" }].map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={channel === c.id}
                className={`pos-pay-btn${channel === c.id ? " on" : ""}`}
                onClick={() => setChannel(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="pos-fields">
            <label className="pos-field">
              <span>Customer name (optional)</span>
              <input id="pos-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in" />
            </label>
            {channel === "dine_in" && (
              <label className="pos-field">
                <span>Table number</span>
                <input id="pos-table" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="e.g. 4" />
              </label>
            )}
          </div>

          <div className="pos-lines">
            {cart.length === 0 && <p className="pos-empty">Tap items to add them.</p>}
            {cart.map((s) => (
              <div key={s.id} className="pos-line">
                <span className="pos-line-name">{s.name}</span>
                <span className="pos-stepper" role="group" aria-label={`Quantity of ${s.name}`}>
                  <button type="button" aria-label={`Remove one ${s.name}`} onClick={() => changeQty(s, -1)}>−</button>
                  <span>{s.qty}</span>
                  <button type="button" aria-label={`Add one ${s.name}`} onClick={() => changeQty(s, 1)}>+</button>
                </span>
                <span className="pos-line-total">{money(s.price * s.qty)}</span>
              </div>
            ))}
          </div>

          <div className="pos-pay" role="radiogroup" aria-label="Payment method">
            {paymentOptions.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={paymentMethod === p.id}
                className={`pos-pay-btn${paymentMethod === p.id ? " on" : ""}`}
                onClick={() => setPaymentMethod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="pos-total">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
          {error && <p className="pos-error" role="alert">{error}</p>}
          <button type="button" className="pos-charge" disabled={cart.length === 0 || placing} onClick={handleCharge}>
            {placing ? "Charging…" : cart.length ? `Charge ${money(total)} · ${payLabel}` : "Charge"}
          </button>
        </aside>
      </div>

      <style>{`
        .pos { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
        @media (min-width: 1000px) { .pos { grid-template-columns: minmax(0, 1fr) 380px; } }
        .pos-menu { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .pos-tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
        .pos-tab {
          flex-shrink: 0; min-height: 48px; padding: 0 20px; border-radius: 12px; border: 1px solid var(--a-border);
          background: var(--a-panel); color: var(--a-text-primary); font: 700 15px var(--font-body);
        }
        .pos-tab.on { background: var(--a-green); border-color: var(--a-green); color: #faf8f3; }

        .pos-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        @media (min-width: 640px) { .pos-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (min-width: 1300px) { .pos-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        .pos-tile {
          background: var(--a-panel); border: 1px solid var(--a-border); border-radius: 16px;
          display: flex; flex-direction: column; overflow: hidden;
        }
        .pos-tile.picked { border: 2px solid var(--a-green); background: var(--a-green-soft); }
        .pos-tile.out { border-style: dashed; background: var(--a-panel-sunk); }
        .pos-tile-btn {
          all: unset; box-sizing: border-box; cursor: pointer; min-height: 116px; padding: 16px;
          display: flex; flex-direction: column; justify-content: space-between; gap: 10px;
        }
        .pos-tile-btn:focus-visible { outline: 2px solid var(--a-accent); outline-offset: -4px; }
        .pos-tile.out .pos-tile-btn { cursor: default; color: var(--a-text-secondary); }
        .pos-tile-name { font-weight: 700; font-size: 16px; line-height: 1.25; }
        .pos-tile-foot { display: flex; justify-content: space-between; align-items: center; }
        .pos-tile-price { font-family: var(--font-display); font-weight: 600; font-size: 20px; }
        .pos-badge {
          min-width: 30px; height: 30px; border-radius: 15px; background: var(--a-green); color: #faf8f3;
          font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; padding: 0 6px; box-sizing: border-box;
        }
        .pos-sold { font-size: 12.5px; font-weight: 700; color: var(--a-danger-text); }
        .pos-avail {
          border: 0; border-top: 1px solid var(--a-border-soft); background: transparent; min-height: 36px;
          font: 600 12.5px var(--font-body); color: var(--a-text-secondary);
        }
        .pos-avail:hover { color: var(--a-green); }
        .pos-empty { margin: 0; font-size: 14px; color: var(--a-text-secondary); }

        .pos-sale {
          background: var(--a-panel); border: 1px solid var(--a-border); border-radius: 18px; padding: 20px;
          display: flex; flex-direction: column; gap: 16px;
        }
        @media (min-width: 1000px) { .pos-sale { position: sticky; top: 20px; } }
        .pos-sale-head { display: flex; justify-content: space-between; align-items: baseline; }
        .pos-sale-head h2 { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: 24px; }
        .pos-clear { border: 0; background: none; color: var(--a-danger-text); font: 600 14px var(--font-body); min-height: 40px; }
        .pos-done {
          background: var(--a-success-bg); color: var(--a-success-text); border-radius: 12px; padding: 12px 14px;
          display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;
        }
        .pos-done p { margin: 0; }
        .pos-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .pos-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .pos-field span { font-size: 12.5px; font-weight: 600; color: var(--a-text-secondary); }
        .pos-field input {
          min-height: 44px; border: 1px solid var(--a-border); border-radius: 12px; padding: 0 12px;
          font: 400 15px var(--font-body); color: var(--a-text-primary); min-width: 0;
        }
        .pos-lines { display: flex; flex-direction: column; min-height: 48px; }
        .pos-line { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--a-border-soft); }
        .pos-line-name { flex: 1; min-width: 0; font-weight: 600; }
        .pos-stepper { display: inline-flex; align-items: center; height: 44px; border: 1px solid var(--a-border); border-radius: 10px; }
        .pos-stepper button { width: 40px; height: 100%; border: 0; background: transparent; font: 700 18px var(--font-body); color: var(--a-text-primary); }
        .pos-stepper span { min-width: 22px; text-align: center; font-weight: 700; }
        .pos-line-total { width: 66px; text-align: right; font-weight: 600; }
        .pos-pay { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .pos-pay-btn {
          min-height: 52px; border-radius: 12px; border: 1px solid var(--a-border); background: var(--a-panel);
          font: 700 15px var(--font-body); color: var(--a-text-primary);
        }
        .pos-pay-btn.on { border: 2px solid var(--a-green); background: var(--a-green-soft); color: var(--a-green); }
        .pos-total { display: flex; justify-content: space-between; align-items: baseline; }
        .pos-total span:first-child { font-weight: 700; }
        .pos-total span:last-child { font-family: var(--font-display); font-weight: 600; font-size: 32px; }
        .pos-error { margin: 0; color: var(--a-danger-text); font-weight: 600; }
        .pos-charge {
          min-height: 64px; border: 0; border-radius: 16px; background: var(--a-green); color: #faf8f3;
          font: 700 18px var(--font-body);
        }
        .pos-charge:disabled { background: var(--a-border); color: var(--a-text-muted); cursor: default; }
      `}</style>
    </AdminPage>
  );
}
