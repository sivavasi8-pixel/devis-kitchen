import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { AdminPage, StatGrid, StatCard, StatusPill, ListPanel, ListRow } from "../components/admin/AdminUI";

const itemsLabel = (items) =>
  (items || [])
    .map((it) => `${it.name}${it.qty > 1 ? ` x${it.qty}` : ""}${it.note ? ` — "${it.note}"` : ""}`)
    .join(", ");

// Devi's Kitchen's status set is wider than the bakery's (delivery/pickup/dine-in
// all have different lifecycles) — the dashboard's quick-advance dropdown only
// offers the kitchen-side steps; delivery/pickup handoff happens on Orders/Rider.
const statusOptions = ["placed", "preparing", "ready"];

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [markingId, setMarkingId] = useState(null);

  const load = () => api.getDashboardSummary().then(setSummary).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const markPaid = async (id) => {
    setMarkingId(id);
    try {
      await api.updateOrderPayment(id, "paid");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setMarkingId(null);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.updateOrderStatus(id, status);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (error) return <AdminPage title="Dashboard"><p style={{ color: "var(--a-danger-text)" }}>Couldn't load dashboard: {error}</p></AdminPage>;
  if (!summary) return <AdminPage title="Dashboard"><p style={{ color: "var(--a-text-secondary)" }}>Loading…</p></AdminPage>;

  return (
    <AdminPage eyebrow="A snapshot of today at Devi's Kitchen" title="Dashboard">
      <StatGrid>
        <StatCard label="Today's revenue" value={`₹${summary.todaysRevenue.toLocaleString()}`} />
        <StatCard label="Orders today" value={summary.ordersToday} sub={`${summary.pendingOrders} pending`} />
        <StatCard label="Staff on shift" value={summary.staffOnShift} sub={`of ${summary.staffTotal} total`} />
        <StatCard
          label="Low stock items"
          value={summary.lowStockCount}
          sub={summary.lowStockCount ? "needs reorder" : "all good"}
          warn={summary.lowStockCount > 0}
        />
      </StatGrid>

      <div className="admin-two-col">
        <div>
          <div className="admin-section-head">
            <p className="admin-section-title">Order queue</p>
            <Link to="/orders" className="admin-view-all">View all orders →</Link>
          </div>
          <ListPanel>
            {summary.recentOrders.map((o) => (
              <ListRow key={o.id}>
                <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    #{o.id} · {o.customerName} <Link to={`/receipt/${o.id}`} className="admin-receipt-link">receipt</Link>
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>
                    {itemsLabel(o.items)} · {o.pickupTime}
                    {o.riderName && ` · Rider: ${o.riderName}`}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {o.paymentStatus === "paid" ? (
                    <span style={{ fontSize: 11, color: "var(--a-success-text)" }}>paid</span>
                  ) : (
                    <button onClick={() => markPaid(o.id)} disabled={markingId === o.id} className="admin-btn-xs">
                      {markingId === o.id ? "…" : "Mark paid"}
                    </button>
                  )}
                  {!statusOptions.includes(o.status) ? (
                    <StatusPill status={o.status} />
                  ) : (
                    <select
                      className="admin-select-sm"
                      value={o.status}
                      onChange={(e) => handleStatusChange(o.id, e.target.value)}
                    >
                      {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              </ListRow>
            ))}
            {summary.recentOrders.length === 0 && (
              <p style={{ padding: 14, fontSize: 13, color: "var(--a-text-secondary)", margin: 0 }}>No recent orders.</p>
            )}
          </ListPanel>
        </div>

        <div>
          <p className="admin-section-title">Low stock</p>
          <ListPanel>
            {summary.lowStockItems.length === 0 && (
              <p style={{ padding: 14, fontSize: 13, color: "var(--a-text-secondary)", margin: 0 }}>Everything's stocked.</p>
            )}
            {summary.lowStockItems.map((item) => (
              <ListRow key={item.id}>
                <p style={{ margin: 0, fontSize: 13 }}>{item.name}</p>
                <span style={{ fontSize: 12, color: "var(--a-danger-text)" }}>{item.quantity} {item.unit} left</span>
              </ListRow>
            ))}
          </ListPanel>
        </div>
      </div>

      <style>{`
        .admin-section-title { font-size: 14px; font-weight: 500; margin-bottom: 10px; }
        .admin-section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px; flex-wrap: wrap; }
        .admin-view-all { font-size: 12px; color: var(--a-green); text-decoration: none; }
        .admin-receipt-link { font-size: 11px; color: var(--a-green); }
        .admin-two-col { display: grid; grid-template-columns: 1fr; gap: 18px; }
        @media (min-width: 900px) { .admin-two-col { grid-template-columns: 1.3fr 1fr; } }
        .admin-btn-xs { font-size: 11px; padding: 3px 8px; border: 1px solid var(--a-border); border-radius: 6px; background: var(--a-panel); }
        .admin-select-sm { border: 1px solid var(--a-border); border-radius: 6px; padding: 5px 8px; font-size: 12px; background: var(--a-panel); }
      `}</style>
    </AdminPage>
  );
}
