import { useEffect, useState } from "react";
import { api } from "../api";
import { AdminPage, StatGrid, StatCard, ListPanel } from "../components/admin/AdminUI";

const dayLabel = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  const isToday = isoDate === new Date().toISOString().slice(0, 10);
  return isToday ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" });
};

const BAR_MAX_HEIGHT = 120;

function RevenueChart({ days }) {
  const [hovered, setHovered] = useState(null);
  const maxRevenue = Math.max(...days.map((d) => d.revenue), 1);
  const peakIndex = days.reduce((best, d, i) => (d.revenue > days[best].revenue ? i : best), 0);
  const weekTotal = days.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--a-text-secondary)" }}>
        ₹{weekTotal.toLocaleString()} total this week
      </p>

      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, borderTop: "1px solid var(--a-border)", fontSize: 11, color: "var(--a-text-muted)" }}>
          <span style={{ position: "relative", top: "-16px" }}>₹{maxRevenue.toLocaleString()}</span>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: BAR_MAX_HEIGHT, borderBottom: "1px solid var(--a-border)", paddingTop: 18 }}>
          {days.map((d, i) => {
            const h = Math.max((d.revenue / maxRevenue) * BAR_MAX_HEIGHT, d.revenue > 0 ? 3 : 1);
            return (
              <div
                key={d.date}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h2) => (h2 === i ? null : h2))}
              >
                {hovered === i && (
                  <div style={{ position: "absolute", bottom: h + 8, background: "var(--a-ink)", color: "#fff", fontSize: 11, padding: "4px 8px", borderRadius: 6, whiteSpace: "nowrap", zIndex: 1 }}>
                    ₹{d.revenue.toLocaleString()} · {d.orders} order{d.orders === 1 ? "" : "s"}
                  </div>
                )}
                {i === peakIndex && d.revenue > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 500, marginBottom: 4 }}>₹{d.revenue.toLocaleString()}</span>
                )}
                <div style={{ width: 24, maxWidth: "60%", height: h, background: "var(--a-green)", borderRadius: "4px 4px 0 0" }} />
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          {days.map((d) => (
            <span key={d.date} style={{ flex: 1, textAlign: "center", fontSize: 11, color: "var(--a-text-muted)" }}>{dayLabel(d.date)}</span>
          ))}
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20, fontSize: 12 }}>
        <thead>
          <tr style={{ color: "var(--a-text-secondary)", textAlign: "left" }}>
            <th style={{ fontWeight: 500, padding: "4px 0" }}>Day</th>
            <th style={{ fontWeight: 500, padding: "4px 0", textAlign: "right" }}>Orders</th>
            <th style={{ fontWeight: 500, padding: "4px 0", textAlign: "right" }}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date} style={{ borderTop: "1px solid var(--a-border)" }}>
              <td style={{ padding: "5px 0" }}>{dayLabel(d.date)}</td>
              <td style={{ padding: "5px 0", textAlign: "right" }}>{d.orders}</td>
              <td style={{ padding: "5px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>₹{d.revenue.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BestSellers({ items }) {
  if (items.length === 0) return <p style={{ fontSize: 13, color: "var(--a-text-secondary)" }}>No orders yet.</p>;
  const maxQty = Math.max(...items.map((i) => i.qty));

  return (
    <div>
      {items.map((item) => (
        <div key={item.name} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span>{item.name}</span>
            <span style={{ color: "var(--a-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{item.qty}</span>
          </div>
          <div style={{ background: "var(--a-bg)", borderRadius: 4, height: 10 }}>
            <div style={{ width: `${(item.qty / maxQty) * 100}%`, height: "100%", background: "var(--a-accent)", borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const expenseCategories = ["ingredients", "utilities", "rent", "wages", "other"];

function ExpensesPanel({ expenses, onChanged }) {
  const [form, setForm] = useState({ description: "", amount: "", category: "ingredients" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.description || !amount || amount <= 0) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.createExpense({ description: form.description, amount, category: form.category });
      setForm({ description: "", amount: "", category: "ingredients" });
      await onChanged();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteExpense(id);
      await onChanged();
    } catch (err) {
      setFormError(err.message);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="no-print admin-expense-form">
        <input className="admin-search" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ flex: 2, minWidth: 120 }} />
        <input type="number" step="0.01" className="admin-search" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ width: 90 }} />
        <select className="admin-search" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {expenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="submit" disabled={saving} className="admin-btn-primary" style={{ width: "auto", padding: "7px 14px" }}>Add</button>
      </form>

      {formError && <p style={{ fontSize: 12, color: "var(--a-danger-text)", marginBottom: 10 }}>{formError}</p>}

      {expenses.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--a-text-secondary)" }}>No expenses logged yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} style={{ borderTop: "1px solid var(--a-border)" }}>
                <td style={{ padding: "6px 0" }}>{e.description}</td>
                <td style={{ padding: "6px 0", color: "var(--a-text-secondary)" }}>{e.category}</td>
                <td style={{ padding: "6px 0", color: "var(--a-text-secondary)" }}>{e.incurredAt}</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>₹{e.amount.toLocaleString()}</td>
                <td style={{ padding: "6px 0 6px 8px", textAlign: "right" }} className="no-print">
                  <button onClick={() => handleDelete(e.id)} className="admin-link-btn danger">remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AdminReports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api.getReports().then(setData).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  if (error) return <AdminPage title="Reports"><p style={{ color: "var(--a-danger-text)" }}>Couldn't load reports: {error}</p></AdminPage>;
  if (!data) return <AdminPage title="Reports"><p style={{ color: "var(--a-text-secondary)" }}>Loading…</p></AdminPage>;

  const exportCSV = () => {
    const lines = ["Day,Orders,Revenue"];
    data.last7Days.forEach((d) => lines.push(`${d.date},${d.orders},${d.revenue}`));
    lines.push("");
    lines.push("Item,Qty sold");
    data.bestSellers.forEach((i) => lines.push(`"${i.name.replace(/"/g, '""')}",${i.qty}`));
    lines.push("");
    lines.push("Expense,Category,Date,Amount");
    data.recentExpenses.forEach((e) => lines.push(`"${e.description.replace(/"/g, '""')}",${e.category},${e.incurredAt},${e.amount}`));
    lines.push("");
    lines.push(`All-time revenue,${data.allTimeRevenue}`);
    lines.push(`All-time expenses,${data.allTimeExpenses}`);
    lines.push(`All-time profit,${data.allTimeProfit}`);

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `devis-kitchen-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AdminPage
      eyebrow="Revenue and top sellers, all-time and this week"
      title="Reports"
      actions={
        <>
          <button onClick={exportCSV} className="admin-btn-sm">Export CSV</button>
          <button onClick={() => window.print()} className="admin-btn-sm">Print / Save as PDF</button>
        </>
      }
    >
      <StatGrid columns={3}>
        <StatCard label="All-time revenue" value={`₹${data.allTimeRevenue.toLocaleString()}`} />
        <StatCard label="All-time expenses" value={`₹${data.allTimeExpenses.toLocaleString()}`} />
        <StatCard label="All-time profit" value={`₹${data.allTimeProfit.toLocaleString()}`} warn={data.allTimeProfit < 0} />
        <StatCard label="All-time orders" value={data.allTimeOrders} />
        <StatCard label="Placed" value={data.ordersByStatus.placed || 0} />
        <StatCard label="Delivered" value={data.ordersByStatus.delivered || 0} />
      </StatGrid>

      <div className="admin-two-col" style={{ marginBottom: 18 }}>
        <div className="admin-form-panel">
          <p className="admin-section-title">Revenue, last 7 days</p>
          <RevenueChart days={data.last7Days} />
        </div>
        <div className="admin-form-panel">
          <p className="admin-section-title">Best sellers</p>
          <BestSellers items={data.bestSellers} />
        </div>
      </div>

      <div className="admin-form-panel">
        <p className="admin-section-title" style={{ marginBottom: 4 }}>Expenses</p>
        <p style={{ fontSize: 12, color: "var(--a-text-secondary)", marginBottom: 14 }}>
          This week: ₹{data.expensesLast7Days.toLocaleString()} spent, ₹{data.profitLast7Days.toLocaleString()} profit.
        </p>
        <ExpensesPanel expenses={data.recentExpenses} onChanged={load} />
      </div>

      <style>{`
        .admin-section-title { font-size: 14px; font-weight: 500; margin-bottom: 10px; }
        .admin-two-col { display: grid; grid-template-columns: 1fr; gap: 18px; }
        @media (min-width: 900px) { .admin-two-col { grid-template-columns: 1.4fr 1fr; } }
        .admin-form-panel { background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius); padding: 18px; }
        .admin-btn-sm { border: 1px solid var(--a-border); background: var(--a-panel); border-radius: 6px; padding: 6px 12px; font-size: 12px; }
        .admin-btn-primary { background: var(--a-green); color: #fff; border: none; border-radius: 6px; font-size: 13px; }
        .admin-search { border: 1px solid var(--a-border); border-radius: 6px; padding: 7px 9px; font-size: 12px; box-sizing: border-box; }
        .admin-expense-form { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
        .admin-link-btn { border: none; background: none; color: var(--a-danger-text); cursor: pointer; font-size: 11px; padding: 0; }
      `}</style>
    </AdminPage>
  );
}
