import { useEffect, useState } from "react";
import { api } from "../api";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Per-row action state: { [customerId]: { mode: "pin"|"password"|null, value, busy, done, error } }
  const [actions, setActions] = useState({});

  useEffect(() => {
    api
      .getCustomers()
      .then(({ customers }) => setCustomers(customers))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const setAction = (id, patch) =>
    setActions((prev) => ({
      ...prev,
      [id]: { mode: null, value: "", busy: false, done: null, error: null, ...prev[id], ...patch }
    }));

  const handleResetPin = async (customer) => {
    const { value } = actions[customer.id] || {};
    if (!/^\d{6}$/.test(value)) {
      setAction(customer.id, { error: "PIN must be exactly 6 digits" });
      return;
    }
    setAction(customer.id, { busy: true, error: null });
    try {
      await api.adminResetCustomerPin(customer.id, value);
      // Update the local row so "PIN set" badge reflects the change immediately.
      setCustomers((prev) =>
        prev.map((c) => (c.id === customer.id ? { ...c, pinSet: true, pinResetRequestedAt: null } : c))
      );
      setAction(customer.id, { busy: false, done: "PIN updated.", mode: null, value: "" });
    } catch (err) {
      setAction(customer.id, { busy: false, error: err.message });
    }
  };

  const handleResetPassword = async (customer) => {
    const { value } = actions[customer.id] || {};
    if (!value || value.length < 8) {
      setAction(customer.id, { error: "Password must be at least 8 characters" });
      return;
    }
    setAction(customer.id, { busy: true, error: null });
    try {
      await api.adminResetCustomerPassword(customer.id, value);
      setAction(customer.id, { busy: false, done: "Password updated.", mode: null, value: "" });
    } catch (err) {
      setAction(customer.id, { busy: false, error: err.message });
    }
  };

  if (loading) return <div style={{ padding: "32px", color: "var(--a-text-secondary)" }}>Loading…</div>;
  if (error) return <div style={{ padding: "32px", color: "var(--a-danger-text)" }}>{error}</div>;

  const pending = customers.filter((c) => c.pinResetRequestedAt);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 780 }}>
      <h1 style={{ fontSize: "22px", marginBottom: "4px" }}>Customers</h1>
      <p style={{ color: "var(--a-text-secondary)", fontSize: "13px", marginBottom: "24px" }}>
        All customer accounts. Use the actions below to reset PINs or passwords on their behalf.
      </p>

      {pending.length > 0 && (
        <div
          style={{
            background: "var(--a-warning-bg, #fff8e1)",
            border: "1px solid var(--a-warning-border, #ffe082)",
            borderRadius: "var(--a-radius, 10px)",
            padding: "12px 16px",
            marginBottom: "24px",
            fontSize: "13px"
          }}
        >
          <strong>⚠️ {pending.length} customer{pending.length > 1 ? "s" : ""} waiting for a PIN reset</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
            {pending.map((c) => (
              <li key={c.id}>
                {c.name} ({c.email}) — requested{" "}
                {new Date(c.pinResetRequestedAt).toLocaleString("en-IN", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {customers.length === 0 ? (
        <p style={{ color: "var(--a-text-secondary)", fontSize: "13px" }}>No customer accounts yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--a-border)" }}>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>Name</th>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>Email</th>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>Phone</th>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>PIN</th>
              <th style={{ padding: "8px 10px", fontWeight: 600 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const a = actions[c.id] || {};
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--a-border)" }}>
                  <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                    {c.name}
                    {c.pinResetRequestedAt && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: "11px",
                          background: "var(--a-warning-bg, #fff8e1)",
                          color: "#b45309",
                          border: "1px solid var(--a-warning-border, #ffe082)",
                          borderRadius: "4px",
                          padding: "1px 5px"
                        }}
                      >
                        PIN help
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 10px", verticalAlign: "top", color: "var(--a-text-secondary)" }}>
                    {c.email}
                  </td>
                  <td style={{ padding: "10px 10px", verticalAlign: "top", color: "var(--a-text-secondary)" }}>
                    {c.phone || "—"}
                  </td>
                  <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 7px",
                        borderRadius: "4px",
                        background: c.pinSet ? "var(--a-green-bg, #e6f4ea)" : "var(--a-surface-2)",
                        color: c.pinSet ? "var(--a-green)" : "var(--a-text-secondary)"
                      }}
                    >
                      {c.pinSet ? "Set" : "Not set"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                    {/* Action buttons */}
                    {!a.mode && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => setAction(c.id, { mode: "pin", value: "", done: null, error: null })}
                          style={actionBtn}
                        >
                          Reset PIN
                        </button>
                        <button
                          onClick={() => setAction(c.id, { mode: "password", value: "", done: null, error: null })}
                          style={actionBtn}
                        >
                          Reset password
                        </button>
                      </div>
                    )}

                    {/* Inline PIN reset */}
                    {a.mode === "pin" && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <input
                          type="password"
                          placeholder="New 6-digit PIN"
                          value={a.value || ""}
                          onChange={(e) => setAction(c.id, { value: e.target.value })}
                          inputMode="numeric"
                          maxLength={6}
                          style={{ ...inlineInput, width: 130 }}
                        />
                        <button
                          onClick={() => handleResetPin(c)}
                          disabled={a.busy}
                          style={confirmBtn}
                        >
                          {a.busy ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setAction(c.id, { mode: null })} style={cancelBtn}>
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Inline password reset */}
                    {a.mode === "password" && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <input
                          type="password"
                          placeholder="New password (8+ chars)"
                          value={a.value || ""}
                          onChange={(e) => setAction(c.id, { value: e.target.value })}
                          style={{ ...inlineInput, width: 180 }}
                        />
                        <button
                          onClick={() => handleResetPassword(c)}
                          disabled={a.busy}
                          style={confirmBtn}
                        >
                          {a.busy ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setAction(c.id, { mode: null })} style={cancelBtn}>
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Feedback messages */}
                    {a.error && (
                      <p style={{ color: "var(--a-danger-text)", fontSize: "12px", margin: "4px 0 0" }}>{a.error}</p>
                    )}
                    {a.done && (
                      <p style={{ color: "var(--a-green)", fontSize: "12px", margin: "4px 0 0" }}>✓ {a.done}</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

const actionBtn = {
  padding: "5px 11px",
  fontSize: "12px",
  border: "1px solid var(--a-border)",
  borderRadius: "6px",
  background: "var(--a-surface)",
  cursor: "pointer",
  color: "var(--a-text)"
};

const inlineInput = {
  padding: "5px 9px",
  fontSize: "12px",
  border: "1px solid var(--a-border)",
  borderRadius: "6px",
  boxSizing: "border-box"
};

const confirmBtn = {
  padding: "5px 11px",
  fontSize: "12px",
  border: "none",
  borderRadius: "6px",
  background: "var(--a-green)",
  color: "#fff",
  cursor: "pointer"
};

const cancelBtn = {
  padding: "5px 11px",
  fontSize: "12px",
  border: "1px solid var(--a-border)",
  borderRadius: "6px",
  background: "none",
  cursor: "pointer",
  color: "var(--a-text-secondary)"
};
