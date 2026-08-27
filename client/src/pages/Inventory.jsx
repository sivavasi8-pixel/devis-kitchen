import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { AdminPage, StatGrid, StatCard, StatusPill, ListPanel, ListRow } from "../components/admin/AdminUI";

const emptyForm = { name: "", unit: "", quantity: "", reorderLevel: "", supplier: "" };

export default function AdminInventory() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [qtyDrafts, setQtyDrafts] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const load = () => api.getInventory().then((data) => setItems(data.items)).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const saveQuantity = async (id) => {
    const raw = qtyDrafts[id];
    if (raw === undefined || raw === "") return;
    setActionError(null);
    try {
      await api.updateInventoryQuantity(id, Number(raw));
      setQtyDrafts((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({ name: item.name, unit: item.unit, quantity: item.quantity, reorderLevel: item.reorderLevel, supplier: item.supplier || "" });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.unit) return;
    setSaving(true);
    setActionError(null);
    const payload = {
      name: form.name,
      unit: form.unit,
      quantity: form.quantity === "" ? undefined : Number(form.quantity),
      reorderLevel: form.reorderLevel === "" ? undefined : Number(form.reorderLevel),
      supplier: form.supplier
    };
    try {
      if (editingId) {
        await api.updateInventoryItem(editingId, payload);
      } else {
        await api.createInventoryItem({ ...payload, quantity: payload.quantity || 0, reorderLevel: payload.reorderLevel || 0 });
      }
      resetForm();
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm(`Remove "${item.name}" from inventory? This also drops it from any recipe that uses it.`)) return;
    setActionError(null);
    try {
      await api.deleteInventoryItem(item.id);
      if (editingId === item.id) resetForm();
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  if (error) return <AdminPage title="Inventory"><p style={{ color: "var(--a-danger-text)" }}>Couldn't load inventory: {error}</p></AdminPage>;
  if (!items) return <AdminPage title="Inventory"><p style={{ color: "var(--a-text-secondary)" }}>Loading…</p></AdminPage>;

  const low = items.filter((i) => i.status !== "in_stock").length;
  const out = items.filter((i) => i.status === "out_of_stock").length;
  const sorted = [...items].sort((a, b) => {
    const order = { out_of_stock: 0, low_stock: 1, in_stock: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <AdminPage eyebrow={`${items.length} ingredients tracked`} title="Inventory">
      <StatGrid columns={3}>
        <StatCard label="Total items" value={items.length} />
        <StatCard label="Low stock" value={low} warn={low > 0} />
        <StatCard label="Out of stock" value={out} warn={out > 0} />
      </StatGrid>

      {actionError && <p style={{ fontSize: 13, color: "var(--a-danger-text)", marginBottom: 14 }}>{actionError}</p>}

      <div className="admin-two-col" style={{ gridTemplateColumns: isOwner ? undefined : "1fr" }}>
        <ListPanel>
          {sorted.map((item) => (
            <ListRow key={item.id}>
              <div style={{ minWidth: 0, flex: "1 1 160px" }}>
                <p style={{ margin: 0, fontSize: 13 }}>{item.name}</p>
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--a-text-secondary)" }}>
                  Reorder level: {item.reorderLevel} {item.unit} · {item.supplier}
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 12 }}>{item.quantity} {item.unit} left</p>
                  <StatusPill status={item.status} />
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder={item.quantity}
                  value={qtyDrafts[item.id] ?? ""}
                  onChange={(e) => setQtyDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                  className="admin-qty-input"
                />
                <button onClick={() => saveQuantity(item.id)} className="admin-btn-xs">Set</button>
                {isOwner && (
                  <>
                    <button onClick={() => startEdit(item)} className="admin-btn-xs">Edit</button>
                    <button onClick={() => handleDelete(item)} className="admin-btn-xs danger">Delete</button>
                  </>
                )}
              </div>
            </ListRow>
          ))}
          {items.length === 0 && (
            <p style={{ padding: 14, fontSize: 13, color: "var(--a-text-secondary)" }}>
              No ingredients yet{isOwner ? " — add one to the right." : "."}
            </p>
          )}
        </ListPanel>

        {isOwner && (
          <form onSubmit={handleSubmit} className="admin-form-panel">
            <p className="admin-section-title">{editingId ? "Edit ingredient" : "Add ingredient"}</p>
            <input className="admin-search" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ marginBottom: 8 }} required />
            <input className="admin-search" placeholder="Unit (e.g. kg, l)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={{ marginBottom: 8 }} required />
            <input type="number" step="0.01" className="admin-search" placeholder="Quantity in stock" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} style={{ marginBottom: 8 }} />
            <input type="number" step="0.01" className="admin-search" placeholder="Reorder level" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} style={{ marginBottom: 8 }} />
            <input className="admin-search" placeholder="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} style={{ marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={saving} className="admin-btn-primary" style={{ flex: 1 }}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Add ingredient"}
              </button>
              {editingId && <button type="button" onClick={resetForm} className="admin-btn-secondary" style={{ width: "auto", padding: "9px 14px" }}>Cancel</button>}
            </div>
          </form>
        )}
      </div>

      <style>{`
        .admin-section-title { font-size: 14px; font-weight: 500; margin-bottom: 10px; }
        .admin-two-col { display: grid; grid-template-columns: 1fr; gap: 18px; }
        @media (min-width: 900px) { .admin-two-col { grid-template-columns: 1.5fr 1fr; } }
        .admin-search { width: 100%; border: 1px solid var(--a-border); border-radius: 6px; padding: 8px 12px; font-size: 13px; box-sizing: border-box; }
        .admin-form-panel { background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius); padding: 16px; align-self: start; }
        .admin-btn-primary { width: 100%; padding: 9px; background: var(--a-green); color: #fff; border: none; border-radius: 6px; font-size: 13px; }
        .admin-btn-secondary { padding: 9px; background: var(--a-bg); border: 1px solid var(--a-border); border-radius: 6px; font-size: 13px; }
        .admin-qty-input { width: 60px; padding: 5px 6px; font-size: 12px; border: 1px solid var(--a-border); border-radius: 6px; }
        .admin-btn-xs { padding: 5px 10px; font-size: 11px; border: 1px solid var(--a-border); border-radius: 6px; background: var(--a-panel); }
        .admin-btn-xs.danger { color: var(--a-danger-text); }
      `}</style>
    </AdminPage>
  );
}
