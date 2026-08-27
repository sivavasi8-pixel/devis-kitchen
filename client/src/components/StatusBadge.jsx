const styles = {
  placed: { bg: "var(--surface-2)", fg: "var(--text-secondary)" },
  preparing: { bg: "#f3e0b8", fg: "#7a5613" },
  ready: { bg: "#dcead9", fg: "#2c5c26" },
  out_for_delivery: { bg: "#dcead9", fg: "#2c5c26" },
  picked_up: { bg: "var(--surface-2)", fg: "var(--text-secondary)" },
  delivered: { bg: "var(--surface-2)", fg: "var(--text-secondary)" },
  cancelled: { bg: "#f4d9d5", fg: "var(--red)" },
  clocked_in: { bg: "#dcead9", fg: "#2c5c26" },
  on_break: { bg: "#f3e0b8", fg: "#7a5613" },
  absent: { bg: "#f4d9d5", fg: "var(--red)" },
  in_stock: { bg: "#dcead9", fg: "#2c5c26" },
  low_stock: { bg: "#f3e0b8", fg: "#7a5613" },
  out_of_stock: { bg: "#f4d9d5", fg: "var(--red)" }
};

const labels = {
  placed: "placed",
  preparing: "preparing",
  ready: "ready",
  out_for_delivery: "out for delivery",
  picked_up: "picked up",
  delivered: "delivered",
  cancelled: "cancelled",
  clocked_in: "clocked in",
  on_break: "on break",
  absent: "absent",
  in_stock: "in stock",
  low_stock: "low stock",
  out_of_stock: "out of stock"
};

export default function StatusBadge({ status }) {
  const style = styles[status] || styles.placed;
  return (
    <span
      style={{
        background: style.bg,
        color: style.fg,
        fontSize: "12px",
        padding: "3px 10px",
        borderRadius: "6px",
        whiteSpace: "nowrap"
      }}
    >
      {labels[status] || status}
    </span>
  );
}
