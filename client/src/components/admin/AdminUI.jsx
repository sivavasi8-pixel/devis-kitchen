export function AdminPage({ eyebrow, title, actions, children }) {
  return (
    <div className="admin-content">
      <div className="admin-page-head">
        <div>
          {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
          <h1 className="admin-title">{title}</h1>
        </div>
        {actions && <div className="admin-page-actions">{actions}</div>}
      </div>
      {children}
      <style>{`
        .admin-content { padding: 20px; max-width: 1300px; padding-bottom: 80px; }
        @media (min-width: 900px) { .admin-content { padding: 28px 32px; padding-bottom: 32px; } }
        .admin-page-head {
          display: flex; justify-content: space-between; align-items: flex-start;
          flex-wrap: wrap; gap: 10px; margin-bottom: 18px;
        }
        .admin-eyebrow { margin: 0 0 3px; font-size: 12px; color: var(--a-text-secondary); }
        .admin-title { font-size: 20px; font-family: var(--font-display); font-weight: 500; margin: 0; }
        .admin-page-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      `}</style>
    </div>
  );
}

export function StatGrid({ columns = 4, children }) {
  return (
    <div className="admin-stat-grid" style={{ "--cols": columns }}>
      {children}
      <style>{`
        .admin-stat-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 22px;
        }
        @media (min-width: 640px) {
          .admin-stat-grid { grid-template-columns: repeat(var(--cols), 1fr); }
        }
      `}</style>
    </div>
  );
}

export function StatCard({ label, value, sub, warn }) {
  return (
    <div className={`admin-stat-card${warn ? " warn" : ""}`}>
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {sub && <p className={`admin-stat-sub${warn ? " warn" : ""}`}>{sub}</p>}
      <style>{`
        .admin-stat-card { background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius); padding: 14px; }
        .admin-stat-card.warn { background: var(--a-warning-bg); border-color: #eddca6; }
        .admin-stat-label { margin: 0 0 6px; font-size: 12px; color: var(--a-text-secondary); }
        .admin-stat-value { margin: 0; font-size: 22px; font-family: var(--font-display); }
        .admin-stat-sub { margin: 6px 0 0; font-size: 11px; color: var(--a-text-secondary); }
        .admin-stat-sub.warn { color: var(--a-danger-text); }
      `}</style>
    </div>
  );
}

// Covers every status value the real app uses across orders, staff, and inventory
// (see StatusBadge.jsx, the customer-facing equivalent of this component).
const pillMap = {
  placed: { bg: "var(--a-border)", fg: "var(--a-text-secondary)", label: "placed" },
  baking: { bg: "var(--a-warning-bg)", fg: "var(--a-warning-text)", label: "baking" },
  ready: { bg: "var(--a-success-bg)", fg: "var(--a-success-text)", label: "ready" },
  delivered: { bg: "var(--a-border)", fg: "var(--a-text-secondary)", label: "delivered" },
  cancelled: { bg: "var(--a-danger-bg)", fg: "var(--a-danger-text)", label: "cancelled" },
  clocked_in: { bg: "var(--a-success-bg)", fg: "var(--a-success-text)", label: "clocked in" },
  clocked_out: { bg: "var(--a-border)", fg: "var(--a-text-secondary)", label: "clocked out" },
  on_break: { bg: "var(--a-warning-bg)", fg: "var(--a-warning-text)", label: "on break" },
  absent: { bg: "var(--a-danger-bg)", fg: "var(--a-danger-text)", label: "absent" },
  in_stock: { bg: "var(--a-success-bg)", fg: "var(--a-success-text)", label: "in stock" },
  low_stock: { bg: "var(--a-warning-bg)", fg: "var(--a-warning-text)", label: "low stock" },
  out_of_stock: { bg: "var(--a-danger-bg)", fg: "var(--a-danger-text)", label: "out of stock" }
};

export function StatusPill({ status }) {
  const p = pillMap[status] || { bg: "var(--a-border)", fg: "var(--a-text-secondary)", label: status };
  return (
    <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 5, whiteSpace: "nowrap", background: p.bg, color: p.fg }}>
      {p.label}
    </span>
  );
}

export function ListPanel({ children }) {
  return (
    <div style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", borderRadius: "var(--a-radius)", overflow: "hidden" }}>
      {children}
    </div>
  );
}

export function ListRow({ children, style }) {
  return (
    <div className="admin-list-row" style={style}>
      {children}
      <style>{`
        .admin-list-row {
          display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;
          padding: 11px 14px; border-bottom: 1px solid var(--a-border);
        }
        .admin-list-row:last-child { border-bottom: none; }
      `}</style>
    </div>
  );
}
