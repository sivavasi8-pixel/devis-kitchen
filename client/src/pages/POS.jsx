import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { AdminPage } from "../components/admin/AdminUI";

// Walk-in counter sale — pickup or dine-in only (a rider isn't involved in
// a counter sale, so "delivery" isn't offered here).
const paymentOptions = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" }
];

export default function AdminPos() {
  const [menu, setMenu] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [channel, setChannel] = useState("pickup");
  const [tableNumber, setTableNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [error, setError] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);

  useEffect(() => {
    api.getMenu().then((d) => setMenu(d.items)).catch((e) => setError(e.message));
  }, []);

  // POS never rings up custom/made-to-order (price=null) or Today's Special items —
  // those go through the customer Order page's dedicated forms.
  const categories = menu
    ? [...new Set(menu.filter((m) => m.price != null && m.category !== "special").map((m) => m.category))]
    : [];

  useEffect(() => {
    if (activeCategory === null && categories.length > 0) setActiveCategory(categories[0]);
  }, [categories, activeCategory]);

  const addToSale = (item) => {
    if (!item.inStock) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) return prev.map((c) => (c.id === item.id ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const removeFromSale = (id) => setCart((prev) => prev.filter((c) => c.id !== id));

  const toggleAvailability = async (item) => {
    try {
      await api.updateMenuAvailability(item.id, !item.inStock);
      const d = await api.getMenu();
      setMenu(d.items);
    } catch (err) {
      setError(err.message);
    }
  };

  const total = cart.reduce((sum, c) => sum + (c.price || 0) * c.qty, 0);

  const handleCharge = async () => {
    setError(null);
    setPlacing(true);
    try {
      const order = await api.createOrder({
        items: cart.map((c) => ({ menuItemId: c.id, name: c.name, qty: c.qty, price: c.price })),
        total,
        customerName: customerName || "Walk-in",
        channel,
        tableNumber: channel === "dine_in" ? tableNumber : undefined,
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

  if (error && !menu) return <AdminPage title="POS"><p style={{ color: "var(--a-danger-text)" }}>Couldn't load menu: {error}</p></AdminPage>;
  if (!menu) return <AdminPage title="POS"><p style={{ color: "var(--a-text-secondary)" }}>Loading…</p></AdminPage>;

  const shown = menu.filter((m) => m.category === activeCategory && m.price != null);

  return (
    <AdminPage eyebrow="Ring up a walk-in sale" title="POS — quick order">
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {categories.map((c) => (
          <button
            key={c}
            className={`admin-cat-btn${activeCategory === c ? " active" : ""}`}
            onClick={() => setActiveCategory(c)}
          >
            {c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>

      <div className="admin-two-col">
        <div className="admin-pos-grid">
          {shown.map((item) => (
            <div key={item.id} className={`admin-pos-item${!item.inStock ? " out" : ""}`}>
              <button onClick={() => addToSale(item)} disabled={!item.inStock} className="admin-pos-item-btn">
                <p style={{ margin: 0, fontSize: 13 }}>{item.name}</p>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--a-text-secondary)" }}>
                  {item.inStock ? `₹${item.price}` : "Sold out"}
                </p>
              </button>
              <button onClick={() => toggleAvailability(item)} className="admin-link-btn">
                {item.inStock ? "mark sold out" : "mark available"}
              </button>
            </div>
          ))}
          {shown.length === 0 && <p style={{ fontSize: 13, color: "var(--a-text-secondary)" }}>Nothing in this category.</p>}
        </div>

        <div className="admin-form-panel">
          <p className="admin-section-title">Current sale</p>

          {placedOrder ? (
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 500 }}>
                Order #{placedOrder.id} rung up — ₹{placedOrder.total}
              </p>
              <Link to={`/receipt/${placedOrder.id}`} className="admin-btn-primary" style={{ display: "block", textAlign: "center", textDecoration: "none", marginBottom: 8, boxSizing: "border-box" }}>
                Print receipt
              </Link>
              <button onClick={() => setPlacedOrder(null)} className="admin-btn-secondary">Start next sale</button>
            </div>
          ) : (
            <>
              <input
                className="admin-search"
                placeholder="Customer name (optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                style={{ marginBottom: 10 }}
              />
              <select className="admin-search" value={channel} onChange={(e) => setChannel(e.target.value)} style={{ marginBottom: 10 }}>
                <option value="pickup">Pickup (counter)</option>
                <option value="dine_in">Dine-in</option>
              </select>
              {channel === "dine_in" && (
                <input
                  className="admin-search"
                  placeholder="Table number"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  style={{ marginBottom: 10 }}
                />
              )}
              <div className="admin-sale-list">
                {cart.length === 0 && <p style={{ fontSize: 12, color: "var(--a-text-muted)", margin: 0 }}>Tap items to add them.</p>}
                {cart.map((s) => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0" }}>
                    <span>{s.name} x{s.qty}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      ₹{s.price * s.qty}
                      <button onClick={() => removeFromSale(s.id)} className="admin-link-btn danger">✕</button>
                    </span>
                  </div>
                ))}
              </div>
              <select
                className="admin-search"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ margin: "10px 0" }}
              >
                {paymentOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ color: "var(--a-text-secondary)" }}>Total</span>
                <span style={{ fontSize: 16, fontWeight: 500 }}>₹{total}</span>
              </div>
              {error && <p style={{ fontSize: 12, color: "var(--a-danger-text)", marginBottom: 10 }}>{error}</p>}
              <button className="admin-btn-primary" disabled={cart.length === 0 || placing} onClick={handleCharge}>
                {placing ? "Charging…" : "Charge and ring up"}
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        .admin-section-title { font-size: 14px; font-weight: 500; margin-bottom: 10px; }
        .admin-two-col { display: grid; grid-template-columns: 1fr; gap: 18px; }
        @media (min-width: 900px) { .admin-two-col { grid-template-columns: 1.5fr 1fr; } }
        .admin-cat-btn { border: 1px solid var(--a-border); background: var(--a-panel); border-radius: 6px; padding: 6px 14px; font-size: 12px; }
        .admin-cat-btn.active { background: var(--a-green); color: #fff; border-color: var(--a-green); }
        .admin-pos-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; align-content: start; }
        .admin-pos-item { background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius); padding: 14px; }
        .admin-pos-item.out { opacity: 0.6; }
        .admin-pos-item-btn {
          all: unset; display: block; width: 100%; cursor: pointer; box-sizing: border-box; margin-bottom: 6px;
        }
        .admin-pos-item.out .admin-pos-item-btn { cursor: default; }
        .admin-pos-item:hover:not(.out) { border-color: var(--a-accent); }
        .admin-link-btn { border: none; background: none; color: var(--a-green); cursor: pointer; font-size: 10px; padding: 0; }
        .admin-link-btn.danger { color: var(--a-danger-text); font-size: 12px; }
        .admin-search { width: 100%; border: 1px solid var(--a-border); border-radius: 6px; padding: 8px 12px; font-size: 13px; box-sizing: border-box; }
        .admin-form-panel { background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius); padding: 16px; }
        .admin-sale-list { min-height: 40px; border: 1px solid var(--a-border); border-radius: 6px; padding: 10px; }
        .admin-btn-primary { width: 100%; padding: 10px; background: var(--a-green); color: #fff; border: none; border-radius: 6px; font-size: 13px; }
        .admin-btn-primary:disabled { background: var(--a-border); color: var(--a-text-muted); }
        .admin-btn-secondary { width: 100%; padding: 10px; background: var(--a-bg); border: 1px solid var(--a-border); border-radius: 6px; font-size: 13px; }
      `}</style>
    </AdminPage>
  );
}
