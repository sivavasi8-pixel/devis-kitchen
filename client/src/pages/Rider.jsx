import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { AdminPage, ListPanel, ListRow, StatusPill } from "../components/admin/AdminUI";
import { scheduleLabel } from "../schedule";

const itemsLabel = (items) => (items || []).map((it) => `${it.name}${it.qty > 1 ? ` x${it.qty}` : ""}`).join(", ");

// Phone / Navigate / cash-to-collect details shared by both lists. Navigate only
// shows when the order has coordinates (a saved address, map pin or GPS fix, or a
// typed address the server could geocode).
function DeliveryDetails({ order }) {
  const phone = order.deliveryPhone;
  const nearby = order.nearbyOrderIds?.length || 0;
  const when = scheduleLabel(order);
  return (
    <>
      {when && (
        <p style={{ margin: "3px 0 0", fontSize: 11.5, fontWeight: 600, color: "var(--a-warning-text)" }}>
          <i className="ti ti-clock" aria-hidden="true" /> Booked for {when}
        </p>
      )}
      {order.channel === "delivery" && (
        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>{order.deliveryAddress}</p>
      )}
      {nearby > 0 && (
        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-green)" }}>
          <i className="ti ti-map-pins" aria-hidden="true" /> {nearby} other order{nearby > 1 ? "s" : ""} within 1 km — worth
          picking up together
        </p>
      )}
      <p style={{ margin: "4px 0 0", fontSize: 11.5, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {order.channel === "delivery" && phone && (
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} style={{ color: "var(--a-green)" }}>
            <i className="ti ti-phone" aria-hidden="true" /> {phone}
          </a>
        )}
        {order.deliveryLat != null && order.deliveryLng != null && (
          <a
            href={`https://www.google.com/maps?q=${order.deliveryLat},${order.deliveryLng}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--a-green)" }}
          >
            <i className="ti ti-map-pin" aria-hidden="true" /> Navigate
          </a>
        )}
      </p>
    </>
  );
}

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

  const load = () =>
    Promise.all([
      api.getMyDeliveries().then((d) => setMine(d.orders)),
      api.getUnassignedDeliveries().then((d) => setUnassigned(d.orders))
    ])
      .then(() => setError(null))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const runAction = async (fn) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err.message);
    }
    // Refresh either way — if someone else claimed the order first, the list is stale.
    await load();
  };

  const claim = (orderId) => runAction(() => api.assignRider(orderId, user.staffId));

  const release = (orderId) => {
    if (!window.confirm("Give this order back to the unassigned list?")) return;
    return runAction(() => api.releaseOrder(orderId));
  };

  const markPickedUp = (order) => {
    const next = order.channel === "delivery" ? "out_for_delivery" : "picked_up";
    runAction(() => api.updateOrderStatus(order.id, next));
  };

  const markDelivered = (order) => runAction(() => api.updateOrderStatus(order.id, "delivered"));

  if (error && !mine) return <AdminPage title="My Deliveries"><p style={{ color: "var(--a-danger-text)" }}>Couldn't load deliveries: {error}</p></AdminPage>;
  if (!mine || !unassigned) return <AdminPage title="My Deliveries"><p style={{ color: "var(--a-text-secondary)" }}>Loading…</p></AdminPage>;

  return (
    <AdminPage eyebrow="Your assigned orders, plus anything ready to claim" title="My Deliveries">
      {(actionError || error) && <p style={{ fontSize: 13, color: "var(--a-danger-text)", marginBottom: 14 }}>{actionError || error}</p>}

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
                {o.priority && <i className="ti ti-flame" aria-hidden="true" title="Priority" style={{ color: "var(--a-danger-text)" }} />} #{o.id} ·{" "}
                {o.customerName} <Link to={`/receipt/${o.id}`} className="admin-receipt-link">receipt</Link>
                {o.distanceFromStoreKm != null && (
                  <span style={{ fontSize: 11, color: "var(--a-text-secondary)" }}> · {o.distanceFromStoreKm} km from shop</span>
                )}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>{itemsLabel(o.items)}</p>
              <DeliveryDetails order={o} />
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--a-text-muted)" }}>
                {o.paymentMethod} · {o.paymentStatus}
              </p>
              {o.paymentStatus !== "paid" && (
                <p style={{ margin: "3px 0 0", fontSize: 12, fontWeight: 500, color: "var(--a-danger-text)" }}>
                  Collect ₹{o.total} ({o.paymentMethod === "cash" ? "cash" : o.paymentMethod})
                </p>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              <StatusPill status={o.status} />
              {o.status === "ready" && (
                <>
                  <button onClick={() => markPickedUp(o)} className="admin-btn-primary" style={{ width: "auto", padding: "6px 12px" }}>
                    Mark picked up
                  </button>
                  <button onClick={() => release(o.id)} className="admin-btn-secondary">
                    Release
                  </button>
                </>
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
                {o.priority && <i className="ti ti-flame" aria-hidden="true" title="Priority" style={{ color: "var(--a-danger-text)" }} />} #{o.id} ·{" "}
                {o.channel.replace("_", "-")}
                {o.distanceFromStoreKm != null && (
                  <span style={{ fontSize: 11, color: "var(--a-text-secondary)" }}> · {o.distanceFromStoreKm} km from shop</span>
                )}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>{itemsLabel(o.items)}</p>
              <DeliveryDetails order={o} />
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
        .admin-btn-secondary { padding: 6px 12px; background: transparent; color: var(--a-text-secondary); border: 1px solid var(--a-border); border-radius: 6px; font-size: 13px; }
      `}</style>
    </AdminPage>
  );
}
