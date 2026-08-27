import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { AdminPage, ListPanel, ListRow, StatusPill } from "../components/admin/AdminUI";

// Rider's own view: their assigned deliveries/pickups, plus a pool of
// unassigned "ready" orders they can claim for themselves. Reuses the same
// AdminPage/ListPanel primitives as the owner/staff admin pages so a rider's
// screen feels like the same product, not a bolt-on.
export default function Rider() {
  const { user } = useAuth();
  const [mine, setMine] = useState(null);
  const [unassigned, setUnassigned] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const load = () => {
    api.getMyDeliveries().then((d) => setMine(d.orders)).catch((e) => setError(e.message));
    api.getUnassignedDeliveries().then((d) => setUnassigned(d.orders)).catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const runAction = async (fn) => {
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const claim = (orderId) => runAction(() => api.assignRider(orderId, user.staffId));

  const markPickedUp = (order) => {
    const next = order.channel === "delivery" ? "out_for_delivery" : "picked_up";
    runAction(() => api.updateOrderStatus(order.id, next));
  };

  const markDelivered = (order) => runAction(() => api.updateOrderStatus(order.id, "delivered"));

  if (error) return <AdminPage title="My Deliveries"><p style={{ color: "var(--a-danger-text)" }}>Couldn't load deliveries: {error}</p></AdminPage>;
  if (!mine || !unassigned) return <AdminPage title="My Deliveries"><p style={{ color: "var(--a-text-secondary)" }}>Loading…</p></AdminPage>;

  return (
    <AdminPage eyebrow="Your assigned orders, plus anything ready to claim" title="My Deliveries">
      {actionError && <p style={{ fontSize: 13, color: "var(--a-danger-text)", marginBottom: 14 }}>{actionError}</p>}

      <p className="admin-section-title">Assigned to me</p>
      <ListPanel>
        {mine.length === 0 && (
          <p style={{ padding: 14, fontSize: 13, color: "var(--a-text-secondary)", margin: 0 }}>
            No orders assigned to you right now.
          </p>
        )}
        {mine.map((o) => (
          <ListRow key={o.id}>
            <div style={{ minWidth: 0, flex: "1 1 220px" }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                #{o.id} · {o.customerName} <Link to={`/receipt/${o.id}`} className="admin-receipt-link">receipt</Link>
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>
                {o.items.map((it) => `${it.name}${it.qty > 1 ? ` x${it.qty}` : ""}`).join(", ")}
              </p>
              {o.channel === "delivery" && (
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>
                  {o.deliveryAddress}{o.deliveryPhone ? ` · ${o.deliveryPhone}` : ""}
                </p>
              )}
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--a-text-muted)" }}>
                {o.paymentMethod} · {o.paymentStatus}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <StatusPill status={o.status} />
              {o.status === "ready" && (
                <button onClick={() => markPickedUp(o)} className="admin-btn-primary" style={{ width: "auto", padding: "6px 12px" }}>
                  Mark picked up
                </button>
              )}
              {o.status === "out_for_delivery" && (
                <button onClick={() => markDelivered(o)} className="admin-btn-primary" style={{ width: "auto", padding: "6px 12px" }}>
                  Mark delivered
                </button>
              )}
            </div>
          </ListRow>
        ))}
      </ListPanel>

      <p className="admin-section-title" style={{ marginTop: 20 }}>Ready for pickup — unassigned</p>
      <ListPanel>
        {unassigned.length === 0 && (
          <p style={{ padding: 14, fontSize: 13, color: "var(--a-text-secondary)", margin: 0 }}>
            Nothing waiting right now.
          </p>
        )}
        {unassigned.map((o) => (
          <ListRow key={o.id}>
            <div style={{ minWidth: 0, flex: "1 1 220px" }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                #{o.id} · {o.channel.replace("_", "-")}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>
                {o.items.map((it) => `${it.name}${it.qty > 1 ? ` x${it.qty}` : ""}`).join(", ")}
              </p>
              {o.channel === "delivery" && (
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>{o.deliveryAddress}</p>
              )}
            </div>
            <button onClick={() => claim(o.id)} className="admin-btn-primary" style={{ width: "auto", padding: "6px 12px", flexShrink: 0 }}>
              Claim this order
            </button>
          </ListRow>
        ))}
      </ListPanel>

      <style>{`
        .admin-section-title { font-size: 14px; font-weight: 500; margin-bottom: 10px; }
        .admin-receipt-link { font-size: 11px; color: var(--a-green); }
        .admin-btn-primary { padding: 10px; background: var(--a-green); color: #fff; border: none; border-radius: 6px; font-size: 13px; }
      `}</style>
    </AdminPage>
  );
}
