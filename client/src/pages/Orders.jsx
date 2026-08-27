import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { AdminPage, StatusPill } from "../components/admin/AdminUI";

// Wider than the bakery's (placed/baking/ready/delivered/cancelled) — delivery
// orders route through out_for_delivery, pickup/dine-in through picked_up or
// straight to delivered.
const statusOptions = ["placed", "preparing", "ready", "out_for_delivery", "picked_up", "delivered", "cancelled"];

const itemsLabel = (items) =>
  (items || [])
    .map((it) => `${it.name}${it.qty > 1 ? ` x${it.qty}` : ""}${it.note ? ` — "${it.note}"` : ""}`)
    .join(", ");

export default function AdminOrders() {
  const [orders, setOrders] = useState(null);
  const [riders, setRiders] = useState([]);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = () => api.getOrders().then((d) => setOrders(d.orders)).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api.getRiders().then((d) => setRiders(d.riders)).catch(() => {});
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

  const handleStatusChange = (id, status) => runAction(() => api.updateOrderStatus(id, status));
  const markPaid = (id) => runAction(() => api.updateOrderPayment(id, "paid"));
  const handleCancel = (order) => {
    if (!confirm(`Cancel order #${order.id}? Any deducted stock will be restocked.`)) return;
    runAction(() => api.cancelOrder(order.id));
  };
  const handleAssignRider = (orderId, riderId) => {
    if (!riderId) return;
    runAction(() => api.assignRider(orderId, riderId));
  };

  if (error) return <AdminPage title="Orders"><p style={{ color: "var(--a-danger-text)" }}>Couldn't load orders: {error}</p></AdminPage>;
  if (!orders) return <AdminPage title="Orders"><p style={{ color: "var(--a-text-secondary)" }}>Loading…</p></AdminPage>;

  const q = search.trim().toLowerCase();
  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (!q) return true;
    return o.customerName.toLowerCase().includes(q) || String(o.id).includes(q);
  });

  const RiderCell = ({ o }) => {
    if (o.channel === "dine_in") return <span style={{ color: "var(--a-text-muted)" }}>—</span>;
    if (o.riderName) return <span>{o.riderName}</span>;
    if (o.status !== "ready") return <span style={{ color: "var(--a-text-muted)" }}>—</span>;
    return (
      <select className="admin-select-sm" defaultValue="" onChange={(e) => handleAssignRider(o.id, e.target.value)}>
        <option value="" disabled>Assign rider</option>
        {riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    );
  };

  const StatusCell = ({ o }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <StatusPill status={o.status} />
      {!["delivered", "picked_up", "cancelled"].includes(o.status) && (
        <>
          <select
            className="admin-select-sm"
            value={o.status}
            onChange={(e) => handleStatusChange(o.id, e.target.value)}
          >
            {statusOptions.filter((s) => s !== "cancelled").map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <button onClick={() => handleCancel(o)} className="admin-link-btn danger">cancel</button>
        </>
      )}
    </div>
  );

  const PaymentCell = ({ o }) =>
    o.paymentStatus === "paid" ? (
      <span style={{ fontSize: 11.5, color: "var(--a-success-text)" }}>paid ({o.paymentMethod})</span>
    ) : (
      <button onClick={() => markPaid(o.id)} className="admin-btn-xs">Mark paid</button>
    );

  return (
    <AdminPage eyebrow={`${orders.length} total. Search by customer name or order #`} title="Orders">
      <div className="admin-filters">
        <input
          className="admin-search"
          placeholder="Search customer or order #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="admin-select-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {actionError && <p style={{ fontSize: 13, color: "var(--a-danger-text)", marginBottom: 14 }}>{actionError}</p>}

      {/* Desktop table */}
      <div className="admin-table-wrap desktop-only">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>Order</th><th>Items</th><th>Total</th><th>Channel</th><th>Rider</th><th>Payment</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id}>
                <td>
                  #{o.id}{o.subscriptionId && <span className="admin-sub-badge" title="Auto-generated from an active meal subscription">subscription</span>}<br />
                  <span style={{ color: "var(--a-text-secondary)" }}>{o.customerName}</span>{" "}
                  <Link to={`/receipt/${o.id}`} className="admin-receipt-link">receipt</Link>
                </td>
                <td style={{ maxWidth: 260 }}>{itemsLabel(o.items)}</td>
                <td>₹{o.total}</td>
                <td>{o.channel.replace("_", "-")}</td>
                <td><RiderCell o={o} /></td>
                <td><PaymentCell o={o} /></td>
                <td><StatusCell o={o} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p style={{ padding: 14, fontSize: 13, color: "var(--a-text-secondary)" }}>No orders match.</p>}
      </div>

      {/* Mobile cards */}
      <div className="admin-card-row mobile-only">
        {filtered.map((o) => (
          <div key={o.id} className="admin-order-card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 6 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                #{o.id} · {o.customerName} <Link to={`/receipt/${o.id}`} className="admin-receipt-link">receipt</Link>
                {o.subscriptionId && <span className="admin-sub-badge" title="Auto-generated from an active meal subscription">subscription</span>}
              </p>
              <span style={{ fontSize: 13, fontWeight: 500 }}>₹{o.total}</span>
            </div>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "var(--a-text-secondary)" }}>{itemsLabel(o.items)}</p>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--a-text-secondary)" }}>
              {o.channel.replace("_", "-")}{o.riderName ? ` · Rider: ${o.riderName}` : ""}
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <PaymentCell o={o} />
              <StatusCell o={o} />
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p style={{ fontSize: 13, color: "var(--a-text-secondary)" }}>No orders match.</p>}
      </div>

      <style>{`
        .admin-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
        .admin-search {
          flex: 1; min-width: 180px; border: 1px solid var(--a-border); border-radius: 6px;
          padding: 8px 12px; font-size: 13px;
        }
        .admin-table-wrap { background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius); overflow-x: auto; }
        .admin-data-table { width: 100%; font-size: 12.5px; }
        .admin-data-table th { text-align: left; padding: 8px 12px; font-weight: 500; color: var(--a-text-secondary); border-bottom: 1px solid var(--a-border); white-space: nowrap; }
        .admin-data-table td { padding: 9px 12px; border-bottom: 1px solid var(--a-border); vertical-align: top; }
        .admin-data-table tr:last-child td { border-bottom: none; }
        .admin-select-sm { border: 1px solid var(--a-border); border-radius: 6px; padding: 5px 8px; font-size: 12px; background: var(--a-panel); }
        .admin-btn-xs { font-size: 11px; padding: 3px 8px; border: 1px solid var(--a-border); border-radius: 6px; background: var(--a-panel); }
        .admin-receipt-link { font-size: 11px; color: var(--a-green); }
        .admin-sub-badge {
          display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 500; letter-spacing: 0.02em;
          padding: 1px 6px; border-radius: 999px; background: var(--a-green-soft, rgba(46,125,50,0.12)); color: var(--a-green);
          vertical-align: middle;
        }
        .admin-link-btn { border: none; background: none; color: var(--a-green); cursor: pointer; font-size: 11px; padding: 0; }
        .admin-link-btn.danger { color: var(--a-danger-text); }

        .admin-card-row { display: flex; flex-direction: column; gap: 8px; }
        .admin-order-card { background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius); padding: 12px; }

        .desktop-only { display: none; }
        .mobile-only { display: block; }
        @media (min-width: 900px) {
          .desktop-only { display: block; }
          .mobile-only { display: none; }
        }
      `}</style>
    </AdminPage>
  );
}
