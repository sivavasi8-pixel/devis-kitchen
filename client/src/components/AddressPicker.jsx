import { useEffect, useState } from "react";
import { api } from "../api";
import AddressFields from "./AddressFields";

// A saved-address book for checkout, same pattern as any ecommerce app: pick
// a saved address (default pre-selected), or add a new one — typed by hand or
// captured from the browser's current location — with an option to save it
// for next time. Reports the effective choice up to the parent via onChange;
// Order.jsx owns the actual deliveryAddress/phone/lat/lng used at checkout.
export default function AddressPicker({ onChange, fallbackPhone }) {
  const [addresses, setAddresses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState("saved"); // "saved" | "new"
  const [selectedId, setSelectedId] = useState(null);
  const [label, setLabel] = useState("Home");
  const [address, setAddress] = useState("");
  const [addrPhone, setAddrPhone] = useState("");
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [saveNew, setSaveNew] = useState(true);

  useEffect(() => {
    api
      .getAddresses()
      .then((d) => {
        setAddresses(d.addresses);
        const def = d.addresses.find((a) => a.isDefault) || d.addresses[0];
        if (def) {
          setSelectedId(def.id);
          setMode("saved");
        } else {
          setMode("new");
        }
      })
      .catch(() => {}) // address book is a nice-to-have — checkout still works with a typed address
      .finally(() => setLoaded(true));
  }, []);

  // Report the effective selection up to the parent whenever it changes.
  useEffect(() => {
    if (!loaded) return;
    if (mode === "saved") {
      const picked = addresses.find((a) => a.id === selectedId);
      onChange({
        address: picked?.address || "",
        phone: picked?.phone || "",
        lat: picked?.lat ?? null,
        lng: picked?.lng ?? null,
        willSave: false,
        label: picked?.label || "Home"
      });
    } else {
      onChange({
        address,
        phone: addrPhone,
        lat,
        lng,
        willSave: saveNew && address.trim().length > 0,
        label
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, mode, selectedId, addresses, address, addrPhone, lat, lng, saveNew, label]);

  const selectSaved = (id) => {
    setSelectedId(id);
    setMode("saved");
  };

  const startNew = () => {
    setMode("new");
    setSelectedId(null);
    setLabel("Home");
    setAddress("");
    setAddrPhone("");
    setLat(null);
    setLng(null);
    setSaveNew(true);
  };

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Remove this address?")) return;
    try {
      await api.deleteAddress(id);
    } catch {
      return;
    }
    const next = addresses.filter((a) => a.id !== id);
    setAddresses(next);
    if (selectedId === id) {
      const def = next.find((a) => a.isDefault) || next[0];
      if (def) selectSaved(def.id);
      else startNew();
    }
  };

  const handleSetDefault = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.setDefaultAddress(id);
      setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
    } catch {
      // Non-critical — the radio selection for this order is unaffected either way.
    }
  };

  if (!loaded) return <p className="empty-note">Loading your addresses…</p>;

  return (
    <div className="address-picker">
      {addresses.length > 0 && mode === "saved" && (
        <div className="address-list">
          {addresses.map((a) => (
            <label key={a.id} className={`address-card${selectedId === a.id ? " on" : ""}`}>
              <input type="radio" name="saved-address" checked={selectedId === a.id} onChange={() => selectSaved(a.id)} />
              <span className="address-card-text">
                <span className="address-card-label">
                  {a.label}
                  {a.isDefault && <em className="address-default-badge">Default</em>}
                </span>
                <span className="address-card-body">{a.address}</span>
              </span>
              <span className="address-card-actions">
                {!a.isDefault && (
                  <button type="button" onClick={(e) => handleSetDefault(a.id, e)}>
                    Set default
                  </button>
                )}
                <button type="button" onClick={(e) => handleDelete(a.id, e)}>
                  Delete
                </button>
              </span>
            </label>
          ))}
          <button type="button" className="address-add-new" onClick={startNew}>
            <i className="ti ti-plus" aria-hidden="true" /> Add a new address
          </button>
        </div>
      )}

      {mode === "new" && (
        <div className="address-new-form">
          {addresses.length > 0 && (
            <button
              type="button"
              className="address-back"
              onClick={() => selectSaved((addresses.find((a) => a.isDefault) || addresses[0]).id)}
            >
              <i className="ti ti-chevron-left" aria-hidden="true" /> Use a saved address
            </button>
          )}
          <AddressFields
            value={{ label, address, phone: addrPhone, lat, lng }}
            onChange={(p) => {
              if ("label" in p) setLabel(p.label);
              if ("address" in p) setAddress(p.address);
              if ("phone" in p) setAddrPhone(p.phone);
              if ("lat" in p) setLat(p.lat);
              if ("lng" in p) setLng(p.lng);
            }}
            fallbackPhone={fallbackPhone}
          />
          <label className="address-save-check">
            <input type="checkbox" checked={saveNew} onChange={(e) => setSaveNew(e.target.checked)} />
            <span>Save this address for next time</span>
          </label>
        </div>
      )}

      <style>{`
        .address-picker { display: flex; flex-direction: column; gap: 10px; }
        .address-list { display: flex; flex-direction: column; gap: 8px; }
        .address-card {
          display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px;
          border: 1px solid var(--border); background: var(--surface-1); cursor: pointer;
        }
        .address-card.on { border: 2px solid var(--green); padding: 11px 13px; }
        .address-card input { width: 20px; height: 20px; margin: 2px 0 0; accent-color: var(--green); flex-shrink: 0; }
        .address-card-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .address-card-label { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px; }
        .address-default-badge {
          font-style: normal; font-size: 10.5px; font-weight: 700; color: var(--green); background: var(--green-tint);
          border-radius: 999px; padding: 1px 7px;
        }
        .address-card-body { font-size: 13px; color: var(--text-secondary); overflow-wrap: anywhere; }
        .address-card-actions { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
        .address-card-actions button {
          border: none; background: none; color: var(--text-secondary); font-size: 11.5px; font-weight: 600;
          text-decoration: underline; padding: 0; cursor: pointer;
        }
        .address-add-new {
          display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; border-radius: 12px;
          border: 1px dashed var(--border); background: transparent; color: var(--green); font: 600 14px var(--font-body);
        }
        .address-new-form { display: flex; flex-direction: column; gap: 10px; }
        .address-back {
          align-self: flex-start; display: flex; align-items: center; gap: 4px; border: none; background: none;
          color: var(--green); font: 600 13px var(--font-body); padding: 0; cursor: pointer;
        }
        .address-save-check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-primary); }
        .address-save-check input { width: 18px; height: 18px; accent-color: var(--green); }

      `}</style>
    </div>
  );
}
