import { useEffect, useState } from "react";
import { api } from "../api";
import AddressFields from "./AddressFields";

const blank = { label: "Home", address: "", phone: "", lat: null, lng: null };

// The My Account address book: every saved address, with Add, Edit, Set default and Delete.
// (Checkout uses AddressPicker instead, which is about choosing one address for an order.)
export default function AddressBook() {
  const [addresses, setAddresses] = useState(null);
  const [error, setError] = useState(null);
  // null = not editing, "new" = adding, otherwise the id being edited
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () =>
    api
      .getAddresses()
      .then((d) => setAddresses(d.addresses))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  const startAdd = () => {
    setEditing("new");
    setForm(blank);
    setMakeDefault(!addresses || addresses.length === 0);
    setFormError(null);
  };

  const startEdit = (a) => {
    setEditing(a.id);
    setForm({ label: a.label, address: a.address, phone: a.phone || "", lat: a.lat, lng: a.lng });
    setMakeDefault(a.isDefault);
    setFormError(null);
  };

  const cancel = () => {
    setEditing(null);
    setFormError(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!form.address.trim()) return setFormError("Please enter the address");
    setSaving(true);
    try {
      if (editing === "new") {
        await api.createAddress({
          label: form.label.trim() || "Home",
          address: form.address.trim(),
          phone: form.phone.trim() || undefined,
          lat: form.lat,
          lng: form.lng,
          isDefault: makeDefault
        });
      } else {
        const original = addresses.find((a) => a.id === editing);
        const fields = {
          label: form.label.trim() || "Home",
          address: form.address.trim(),
          phone: form.phone.trim() || null
        };
        // If the address text changed but the pin didn't, the old coordinates now point at the
        // wrong place. Leave them out so the server looks the new text up again.
        const textChanged = original.address !== fields.address;
        const pinChanged = original.lat !== form.lat || original.lng !== form.lng;
        if (!textChanged || pinChanged) {
          fields.lat = form.lat;
          fields.lng = form.lng;
        }
        await api.updateAddress(editing, fields);
        if (makeDefault && !original.isDefault) await api.setDefaultAddress(editing);
      }
      await load();
      setEditing(null);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a) => {
    if (!window.confirm(`Remove "${a.label}"?`)) return;
    setBusyId(a.id);
    try {
      await api.deleteAddress(a.id);
      if (editing === a.id) setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleSetDefault = async (a) => {
    setBusyId(a.id);
    try {
      await api.setDefaultAddress(a.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (error && !addresses) return <p className="ab-error">Couldn't load your addresses: {error}</p>;
  if (!addresses) return <p className="ab-muted">Loading your addresses…</p>;

  return (
    <div className="ab">
      {error && <p className="ab-error" role="alert">{error}</p>}

      {addresses.length === 0 && editing !== "new" && (
        <p className="ab-muted">You haven't saved an address yet. Add one to check out faster.</p>
      )}

      {addresses.map((a) =>
        editing === a.id ? (
          <form key={a.id} className="ab-form" onSubmit={handleSave}>
            <h3 className="ab-form-title">Edit address</h3>
            <AddressFields value={form} onChange={patch} />
            <label className="ab-check">
              <input type="checkbox" checked={makeDefault} disabled={a.isDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
              <span>{a.isDefault ? "This is your default address" : "Make this my default address"}</span>
            </label>
            {formError && <p className="ab-error" role="alert">{formError}</p>}
            <div className="ab-actions">
              <button type="submit" className="ab-btn" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
              <button type="button" className="ab-btn ab-btn-quiet" onClick={cancel} disabled={saving}>Cancel</button>
            </div>
          </form>
        ) : (
          <div key={a.id} className="ab-card">
            <div className="ab-card-text">
              <span className="ab-card-label">
                {a.label}
                {a.isDefault && <em className="ab-badge">Default</em>}
              </span>
              <span className="ab-card-body">{a.address}</span>
              {a.phone && <span className="ab-card-meta"><i className="ti ti-phone" aria-hidden="true" /> {a.phone}</span>}
              {a.lat !== null && a.lng !== null && (
                <span className="ab-card-meta"><i className="ti ti-map-pin" aria-hidden="true" /> Pinned location saved</span>
              )}
            </div>
            <div className="ab-card-actions">
              <button type="button" onClick={() => startEdit(a)} disabled={busyId === a.id || editing !== null}>Edit</button>
              {!a.isDefault && (
                <button type="button" onClick={() => handleSetDefault(a)} disabled={busyId === a.id}>Set default</button>
              )}
              <button type="button" className="ab-danger" onClick={() => handleDelete(a)} disabled={busyId === a.id}>Delete</button>
            </div>
          </div>
        )
      )}

      {editing === "new" ? (
        <form className="ab-form" onSubmit={handleSave}>
          <h3 className="ab-form-title">New address</h3>
          <AddressFields value={form} onChange={patch} />
          <label className="ab-check">
            <input type="checkbox" checked={makeDefault} disabled={addresses.length === 0} onChange={(e) => setMakeDefault(e.target.checked)} />
            <span>{addresses.length === 0 ? "This will be your default address" : "Make this my default address"}</span>
          </label>
          {formError && <p className="ab-error" role="alert">{formError}</p>}
          <div className="ab-actions">
            <button type="submit" className="ab-btn" disabled={saving}>{saving ? "Saving…" : "Save address"}</button>
            <button type="button" className="ab-btn ab-btn-quiet" onClick={cancel} disabled={saving}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="ab-add" onClick={startAdd} disabled={editing !== null}>
          <i className="ti ti-plus" aria-hidden="true" /> Add a new address
        </button>
      )}

      <style>{`
        .ab { display: flex; flex-direction: column; gap: 10px; }
        .ab-muted { margin: 0; font-size: 13.5px; color: var(--text-secondary); }
        .ab-error { margin: 0; font-size: 13.5px; color: var(--red); }
        .ab-card {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap;
          padding: 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-1);
        }
        .ab-card-text { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .ab-card-label { font-weight: 600; font-size: 14.5px; display: flex; align-items: center; gap: 8px; }
        .ab-badge {
          font-style: normal; font-size: 10.5px; font-weight: 700; color: var(--green); background: var(--green-tint);
          border-radius: 999px; padding: 1px 8px;
        }
        .ab-card-body { font-size: 13.5px; color: var(--text-secondary); overflow-wrap: anywhere; }
        .ab-card-meta { font-size: 12.5px; color: var(--text-secondary); }
        .ab-card-actions { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
        .ab-card-actions button {
          border: none; background: none; padding: 8px 0; min-height: 36px; font: 600 13px var(--font-body);
          color: var(--green); cursor: pointer;
        }
        .ab-card-actions button:disabled { opacity: 0.5; cursor: default; }
        .ab-card-actions .ab-danger { color: var(--red); }
        .ab-add {
          display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; border-radius: 12px;
          border: 1px dashed var(--border); background: transparent; color: var(--green); font: 600 14px var(--font-body); cursor: pointer;
        }
        .ab-add:disabled { opacity: 0.5; cursor: default; }
        .ab-form {
          display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 12px;
          border: 2px solid var(--green); background: var(--surface-1);
        }
        .ab-form-title { margin: 0; font-size: 15px; }
        .ab-check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; }
        .ab-check input { width: 18px; height: 18px; accent-color: var(--green); }
        .ab-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .ab-btn {
          min-height: 46px; padding: 0 22px; border: none; border-radius: 12px; background: var(--green); color: var(--cream);
          font: 700 14px var(--font-body); cursor: pointer;
        }
        .ab-btn:disabled { opacity: 0.6; cursor: default; }
        .ab-btn-quiet { background: transparent; color: var(--text-primary); border: 1px solid var(--border); font-weight: 600; }
      `}</style>
    </div>
  );
}
