import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge";

export default function MyOrders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const load = () => api.getMyOrders().then((d) => setOrders(d.orders)).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const handleCancel = async (order) => {
    if (!confirm(`Cancel order #${order.id}?`)) return;
    setCancellingId(order.id);
    try {
      await api.cancelOrder(order.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancellingId(null);
    }
  };

  if (error) return <p style={{ padding: 28, color: "var(--red)" }}>Couldn't load your orders: {error}</p>;
  if (!orders) return <p style={{ padding: 28, color: "var(--text-secondary)" }}>Loading your orders…</p>;

  return (
    <div className="page">
      <p className="eyebrow">{orders.length} order{orders.length !== 1 ? "s" : ""} placed</p>
      <h1 className="page-title">My orders</h1>

      {orders.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">🛍️</span>
          <p>No orders yet — <Link to="/order">browse the menu</Link> to place your first one.</p>
        </div>
      )}

      <div className="order-list">
        {orders.map((o) => (
          <div key={o.id} className="order-card">
            <div className="order-card-main">
              <div className="order-card-head">
                <p className="order-id">
                  #{o.id} · {new Date(o.createdAt).toLocaleDateString()}
                </p>
                <Link to={`/receipt/${o.id}`} className="receipt-link">receipt</Link>
              </div>
              <p className="order-items">
                {o.items.map((it) => `${it.name}${it.qty > 1 ? ` x${it.qty}` : ""}${it.note ? ` — "${it.note}"` : ""}`).join(", ")}
                {" · "}{o.channel.replace("_", "-")}
                {o.riderName ? ` · Rider: ${o.riderName}` : ""}
              </p>
              <p className={`payment-line${o.paymentStatus === "paid" ? " payment-paid" : ""}`}>
                {o.paymentStatus === "paid" ? "Paid" : `Pay on ${o.channel === "delivery" ? "delivery" : "pickup"}`}{o.paymentMethod ? ` · ${o.paymentMethod}` : ""}
              </p>
              {o.status === "placed" && (
                <button
                  onClick={() => handleCancel(o)}
                  disabled={cancellingId === o.id}
                  className="cancel-link"
                >
                  {cancellingId === o.id ? "Cancelling…" : "Cancel order"}
                </button>
              )}
            </div>
            <div className="order-card-side">
              <p className="order-total">₹{o.total}</p>
              <StatusBadge status={o.status} />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .eyebrow { margin: 0 0 4px; font-size: 13px; color: var(--text-secondary); }
        .page-title { font-size: 24px; margin-bottom: 20px; }

        .empty-state { text-align: center; padding: 60px 20px; color: var(--text-secondary); }
        .empty-icon { font-size: 32px; margin-bottom: 10px; display: block; }
        .empty-state p { margin: 0; font-size: 14px; }
        .empty-state a { color: var(--green); }

        .order-list { display: flex; flex-direction: column; gap: 10px; }
        .order-card {
          background: var(--surface-1); border: 1px solid var(--border);
          border-radius: var(--radius-lg); padding: 14px 16px;
          display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px;
        }
        .order-card-main { flex: 1 1 220px; min-width: 0; }
        .order-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
        .order-id { margin: 0; font-size: 13px; font-weight: 500; }
        .receipt-link { font-size: 12px; color: var(--gold); text-decoration: underline; }
        .order-items { margin: 0 0 4px; font-size: 12px; color: var(--text-secondary); }
        .payment-line { margin: 0 0 8px; font-size: 11px; color: var(--red); }
        .payment-paid { color: #2c5c26; }
        .cancel-link {
          background: none; border: none; padding: 0; font-size: 12px;
          color: var(--red); text-decoration: underline; cursor: pointer;
        }
        .order-card-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
        .order-total { margin: 0; font-size: 15px; font-weight: 500; }
      `}</style>
    </div>
  );
}
