import { useEffect, useState } from "react";
import { api } from "../../api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const blankZone = { label: "", maxKm: "", fee: "", freeAbove: "", minOrder: "" };

const panelStyle = {
  background: "var(--a-panel)",
  border: "1px solid var(--a-border)",
  borderRadius: "var(--a-radius)",
  padding: "18px",
  display: "flex",
  flexDirection: "column",
  gap: "14px"
};
const inputStyle = {
  minHeight: 36,
  padding: "0 10px",
  border: "1px solid var(--a-border)",
  borderRadius: 8,
  fontSize: 13,
  background: "var(--a-panel)",
  color: "var(--a-text-primary)",
  width: "100%",
  boxSizing: "border-box"
};
const labelStyle = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, fontWeight: 600 };

// Opening hours, order-ahead slots and delivery zones. Saved as one block, validated on
// the server (see server/services/ordering.js), so a bad entry rejects the whole save.
export default function OrderingSettings() {
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setCfg(s.ordering))
      .catch((e) => setError(e.message));
  }, []);

  if (!cfg) return error ? <p style={{ color: "var(--a-danger-text)" }}>{error}</p> : null;

  const set = (patch) => {
    setSaved(false);
    setCfg((c) => ({ ...c, ...patch }));
  };
  const setZone = (i, patch) => set({ zones: cfg.zones.map((z, idx) => (idx === i ? { ...z, ...patch } : z)) });
  const toggleDay = (d) =>
    set({ closedWeekdays: cfg.closedWeekdays.includes(d) ? cfg.closedWeekdays.filter((x) => x !== d) : [...cfg.closedWeekdays, d] });

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await api.updateSettings({
        ordering: {
          ...cfg,
          slotMinutes: Number(cfg.slotMinutes),
          daysAhead: Number(cfg.daysAhead),
          sameDayNoticeMinutes: Number(cfg.sameDayNoticeMinutes),
          zones: cfg.zones.map((z) => ({
            label: z.label,
            maxKm: Number(z.maxKm),
            fee: Number(z.fee || 0),
            freeAbove: Number(z.freeAbove || 0),
            minOrder: Number(z.minOrder || 0)
          }))
        }
      });
      setCfg(updated.ordering);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} style={panelStyle}>
      <div>
        <h2 style={{ margin: 0, fontSize: 16 }}>Ordering hours &amp; delivery</h2>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--a-text-secondary)" }}>
          Customers can order "as soon as possible" while you're open, or book a time slot ahead. Delivery fees come from
          how far the drop point is from your restaurant (set its location above).
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={labelStyle}>
          Opens
          <input type="time" value={cfg.open} onChange={(e) => set({ open: e.target.value })} style={inputStyle} required />
        </label>
        <label style={labelStyle}>
          Closes
          <input type="time" value={cfg.close} onChange={(e) => set({ close: e.target.value })} style={inputStyle} required />
        </label>
        <label style={labelStyle}>
          Slot length
          <select value={cfg.slotMinutes} onChange={(e) => set({ slotMinutes: e.target.value })} style={inputStyle}>
            {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          Book up to (days ahead)
          <input type="number" min="0" max="14" value={cfg.daysAhead} onChange={(e) => set({ daysAhead: e.target.value })} style={inputStyle} required />
        </label>
        <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
          Minimum notice for a same-day slot (minutes)
          <input type="number" min="0" max="600" value={cfg.sameDayNoticeMinutes} onChange={(e) => set({ sameDayNoticeMinutes: e.target.value })} style={inputStyle} required />
        </label>
      </div>

      <div>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Closed on</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {WEEKDAYS.map((name, d) => (
            <button
              key={d}
              type="button"
              aria-pressed={cfg.closedWeekdays.includes(d)}
              className={`admin-btn-xs${cfg.closedWeekdays.includes(d) ? " active" : ""}`}
              onClick={() => toggleDay(d)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Delivery zones</span>
        <p style={{ margin: "2px 0 8px", fontSize: 12, color: "var(--a-text-secondary)" }}>
          Nearest first. An order goes in the first zone that covers its distance; anything beyond the last zone isn't delivered.
          "Free above" of 0 means the fee always applies.
        </p>
        {cfg.zones.map((z, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--a-border-soft)" }}>
            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
              Name
              <input value={z.label} onChange={(e) => setZone(i, { label: e.target.value })} style={inputStyle} placeholder="e.g. Nearby (up to 3 km)" />
            </label>
            <label style={labelStyle}>Up to (km)<input type="number" min="0.1" step="0.1" value={z.maxKm} onChange={(e) => setZone(i, { maxKm: e.target.value })} style={inputStyle} required /></label>
            <label style={labelStyle}>Fee (₹)<input type="number" min="0" value={z.fee} onChange={(e) => setZone(i, { fee: e.target.value })} style={inputStyle} required /></label>
            <label style={labelStyle}>Free above (₹)<input type="number" min="0" value={z.freeAbove} onChange={(e) => setZone(i, { freeAbove: e.target.value })} style={inputStyle} /></label>
            <label style={labelStyle}>Min order (₹)<input type="number" min="0" value={z.minOrder} onChange={(e) => setZone(i, { minOrder: e.target.value })} style={inputStyle} /></label>
            <button type="button" className="admin-btn-xs danger" style={{ gridColumn: "1 / -1", justifySelf: "start" }} onClick={() => set({ zones: cfg.zones.filter((_, idx) => idx !== i) })}>
              Remove zone
            </button>
          </div>
        ))}
        <button type="button" className="admin-btn-xs" onClick={() => set({ zones: [...cfg.zones, { ...blankZone }] })}>
          + Add zone
        </button>
        {cfg.zones.length === 0 && (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--a-text-secondary)" }}>
            No zones: delivery is free and has no distance limit.
          </p>
        )}
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: "var(--a-danger-text)" }}>{error}</p>}
      {saved && <p style={{ margin: 0, fontSize: 13, color: "var(--a-success-text)" }}>Saved.</p>}
      <button type="submit" disabled={saving} className="a-btn primary" style={{ alignSelf: "flex-start" }}>
        {saving ? "Saving…" : "Save ordering settings"}
      </button>
    </form>
  );
}
