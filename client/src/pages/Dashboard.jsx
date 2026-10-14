import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { AdminPage, StatGrid, StatCard, StatusPill, ListPanel } from "../components/admin/AdminUI";
import { nextStep } from "../orderSteps";
import { scheduleLabel } from "../schedule";

const channelLabel = (c) => ({ delivery: "Delivery", pickup: "Pickup", dine_in: "Dine-in" })[c] || c;
const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const itemsLabel = (items) =>
  items.map((it) => `${it.qty > 1 ? `${it.qty} × ` : ""}${it.name}${it.note ? ` · “${it.note}”` : ""}`).join(", ");

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const todayLabel = () =>
  new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const weekdayOf = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });

function WeekChart({ days }) {
  const max = Math.max(...days.map((d) => d.revenue), 1);
  const last = days.length - 1;
  return (
    <div className="week-chart" role="img" aria-label={`Revenue for the last 7 days: ${days.map((d) => `${weekdayOf(d.date)} ${money(d.revenue)}`).join(", ")}`}>
      {days.map((d, i) => {
        const closed = false;
        return (
          <div key={d.date} className="week-col">
            <span className="week-amount">{closed ? "Closed" : money(d.revenue)}</span>
            <div className="week-track">
              <div
                className={`week-bar${i === last ? " today" : ""}${closed || d.revenue === 0 ? " empty" : ""}`}
                style={{ height: `${Math.max((d.revenue / max) * 100, 2)}%` }}
              />
            </div>
            <span className="week-day">{i === last ? "Today" : weekdayOf(d.date)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [summary, setSummary] = useState(null);
  const [week, setWeek] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => api.getDashboardSummary().then(setSummary).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // Revenue history is owner-only (the reports endpoint enforces it).
    if (isOwner) api.getReports().then((r) => setWeek(r.last7Days)).catch(() => {});
  }, [isOwner]);

  const act = async (id, fn) => {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <AdminPage title="Dashboard"><p style={{ color: "var(--a-danger-text)" }}>Couldn't load the dashboard: {error}. Refresh to try again.</p></AdminPage>;
  if (!summary) return <AdminPage title="Dashboard"><p style={{ color: "var(--a-text-secondary)" }}>Loading…</p></AdminPage>;

  const queue = summary.queue || summary.recentOrders;
  const staff = summary.staff || [];
  const awaiting = summary.awaitingPayment || { count: 0, total: 0 };
  const lowNames = summary.lowStockItems.slice(0, 2).map((i) => i.name).join(", ");

  return (
    <AdminPage
      eyebrow={todayLabel()}
      title={greeting()}
      actions={<Link to="/pos" className="a-btn primary"><i className="ti ti-cash-register" aria-hidden="true" /> New sale</Link>}
    >
      <StatGrid>
        <StatCard label="Revenue today" value={money(summary.todaysRevenue)} sub={`${summary.ordersToday} order${summary.ordersToday === 1 ? "" : "s"}`} />
        <StatCard
          label="To cook now"
          value={summary.toCook ?? summary.pendingOrders}
          sub={summary.activeCount ? `${summary.activeCount} order${summary.activeCount === 1 ? "" : "s"} in progress` : "Nothing waiting"}
        />
        <StatCard
          label="Awaiting payment"
          value={money(awaiting.total)}
          sub={awaiting.count ? `${awaiting.count} order${awaiting.count === 1 ? "" : "s"} to confirm` : "All paid"}
          tone={awaiting.count ? "danger" : undefined}
        />
        <StatCard
          label="Running low"
          value={summary.lowStockCount}
          sub={summary.lowStockCount ? lowNames : "All stocked"}
          tone={summary.lowStockCount ? "warn" : undefined}
        />
      </StatGrid>

      {actionError && <p className="dash-error" role="alert">{actionError}</p>}

      <div className="dash-grid">
        <ListPanel title="Order queue" action={<Link to="/orders" className="dash-link">Open board</Link>}>
          {queue.length === 0 && <p className="dash-empty">No orders in progress. New ones appear here as they come in.</p>}
          {queue.map((o) => {
            const next = nextStep(o);
            return (
              <div key={o.id} className="queue-row">
                <div className="queue-id">
                  <span>#{o.id}</span>
                  <Link to={`/receipt/${o.id}`} className="dash-link small">Receipt</Link>
                </div>
                <div className="queue-main">
                  <span className="queue-name">{o.customerName}{o.deliveryPhone ? <span className="queue-phone"> · {o.deliveryPhone}</span> : null}</span>
                  <span className="queue-items">{itemsLabel(o.items)}</span>
                  <span className="queue-meta">
                    {channelLabel(o.channel)}
                    {o.channel === "dine_in" ? ` · Table ${o.tableNumber || "—"}` : o.channel === "delivery" && o.deliveryAddress ? ` · ${o.deliveryAddress}` : ""}
                    {scheduleLabel(o) ? ` · ${scheduleLabel(o)}` : ""}
                    {o.riderName ? ` · Rider: ${o.riderName}` : ""}
                  </span>
                </div>
                <div className="queue-state">
                  <StatusPill status={o.status} />
                  {o.paymentStatus !== "paid" && <StatusPill status="unpaid" label={o.paymentMethod === "cash" ? "Cash due" : "Confirm pay"} />}
                </div>
                <div className="queue-actions">
                  {o.paymentStatus !== "paid" && (
                    <button type="button" className="a-btn quiet" disabled={busyId === o.id} onClick={() => act(o.id, () => api.updateOrderPayment(o.id, "paid"))}>
                      Mark paid
                    </button>
                  )}
                  {next && (
                    <button type="button" className="a-btn" disabled={busyId === o.id} onClick={() => act(o.id, () => api.updateOrderStatus(o.id, next.status))}>
                      {busyId === o.id ? "Saving…" : next.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </ListPanel>

        <div className="dash-side">
          <ListPanel title="Running low" action={<Link to="/inventory" className="dash-link">Inventory</Link>}>
            {summary.lowStockItems.length === 0 ? (
              <p className="dash-empty">Everything's stocked.</p>
            ) : (
              <div className="low-list">
                {summary.lowStockItems.map((item) => {
                  const pct = item.reorderLevel > 0 ? Math.min((item.quantity / (item.reorderLevel * 2)) * 100, 100) : 0;
                  return (
                    <div key={item.id} className="low-item">
                      <div className="low-text">
                        <span className="low-name">{item.name}</span>
                        <span className="low-left">{item.quantity} {item.unit} left · reorder at {item.reorderLevel}</span>
                      </div>
                      <div className="low-track"><div className={`low-bar${item.quantity <= 0 ? " out" : ""}`} style={{ width: `${Math.max(pct, 3)}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </ListPanel>

          <ListPanel title="On shift" action={<span className="dash-count">{summary.staffOnShift} of {summary.staffTotal}</span>}>
            {staff.length === 0 && <p className="dash-empty">No staff added yet.</p>}
            {staff.map((s) => (
              <div key={s.id} className="staff-row">
                <span className="staff-avatar" aria-hidden="true">{initials(s.name)}</span>
                <span className="staff-text">
                  <span className="staff-name">{s.name}</span>
                  <span className="staff-role">{s.role} · {s.shift}</span>
                </span>
                <StatusPill status={s.status} />
              </div>
            ))}
          </ListPanel>
        </div>
      </div>

      {isOwner && week && (
        <section className="week-panel" aria-labelledby="week-heading">
          <div className="week-head">
            <h2 id="week-heading" className="admin-section-title" style={{ margin: 0 }}>Last 7 days</h2>
            <Link to="/reports" className="dash-link">Reports</Link>
          </div>
          <WeekChart days={week} />
        </section>
      )}

      <style>{`
        .dash-error { color: var(--a-danger-text); margin: 0 0 16px; font-weight: 600; }
        .dash-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
        @media (min-width: 1100px) { .dash-grid { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); } }
        .dash-side { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
        .dash-link { font-size: 14px; font-weight: 600; color: var(--a-green); text-decoration: none; }
        .dash-link:hover { text-decoration: underline; }
        .dash-link.small { font-size: 12.5px; }
        .dash-count { font-size: 13px; color: var(--a-text-secondary); font-weight: 600; }
        .dash-empty { margin: 0; padding: 18px; color: var(--a-text-secondary); }

        .queue-row {
          display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px 14px; align-items: center;
          padding: 14px 18px; border-bottom: 1px solid var(--a-border-soft);
        }
        .queue-row:last-child { border-bottom: none; }
        .queue-id { display: flex; flex-direction: column; gap: 2px; font-weight: 700; }
        .queue-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .queue-name { font-weight: 600; }
        .queue-phone { font-weight: 400; color: var(--a-text-secondary); }
        .queue-items { font-size: 13.5px; color: var(--a-text-primary); overflow-wrap: anywhere; }
        .queue-meta { font-size: 13px; color: var(--a-text-secondary); }
        .queue-state { grid-column: 2; display: flex; gap: 6px; flex-wrap: wrap; }
        .queue-actions { grid-column: 2; display: flex; gap: 8px; flex-wrap: wrap; }
        @media (min-width: 760px) {
          .queue-row { grid-template-columns: 64px minmax(0, 1fr) auto auto; }
          .queue-state, .queue-actions { grid-column: auto; }
          .queue-state { flex-direction: column; align-items: flex-start; }
        }

        .low-list { display: flex; flex-direction: column; gap: 14px; padding: 16px 18px; }
        .low-item { display: flex; flex-direction: column; gap: 6px; }
        .low-text { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .low-name { font-weight: 600; }
        .low-left { font-size: 13px; color: var(--a-text-secondary); }
        .low-track { height: 8px; border-radius: 4px; background: var(--a-panel-sunk); overflow: hidden; }
        .low-bar { height: 100%; border-radius: 4px; background: #c98a1a; }
        .low-bar.out { background: var(--a-danger-text); }

        .staff-row { display: flex; align-items: center; gap: 12px; padding: 10px 18px; border-bottom: 1px solid var(--a-border-soft); }
        .staff-row:last-child { border-bottom: none; }
        .staff-avatar {
          width: 36px; height: 36px; border-radius: 18px; background: var(--a-green-soft); color: var(--a-green);
          font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .staff-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .staff-name { font-weight: 600; }
        .staff-role { font-size: 12.5px; color: var(--a-text-secondary); }

        .week-panel {
          margin-top: 20px; background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius-lg);
          padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 14px;
        }
        .week-head { display: flex; justify-content: space-between; align-items: baseline; }
        .week-chart { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; height: 170px; }
        .week-col { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
        .week-amount { font-size: 11.5px; color: var(--a-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .week-track { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
        .week-bar { width: 100%; max-width: 56px; border-radius: 6px 6px 0 0; background: var(--a-green); }
        .week-bar.today { background: var(--a-accent); }
        .week-bar.empty { background: var(--a-border); }
        .week-day { font-size: 12px; font-weight: 600; color: var(--a-text-secondary); }
      `}</style>
    </AdminPage>
  );
}
