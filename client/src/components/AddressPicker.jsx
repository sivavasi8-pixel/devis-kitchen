import { useEffect, useState } from "react";
import { api } from "../api";
import MapPicker from "./MapPicker";

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
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [mapsLink, setMapsLink] = useState("");
  const [resolvingLink, setResolvingLink] = useState(false);
  const [linkError, setLinkError] = useState(null);

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
    setLocError(null);
    setShowMap(false);
    setMapsLink("");
    setLinkError(null);
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

  // Shared by all three ways to get a pin — GPS, the map, or a pasted link —
  // so each only has to supply the coordinates; filling in the address text
  // (best-effort) happens in one place.
  const applyPin = async (newLat, newLng) => {
    setLat(newLat);
    setLng(newLng);
    try {
      const res = await api.reverseGeocode(newLat, newLng);
      if (res.address) setAddress(res.address);
    } catch {
      // Lat/lng alone still helps staff find the drop point even without a label.
    }
  };

  const handleUseLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocError("Location isn't supported in this browser — try 'Pick on map' or type your address instead.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await applyPin(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setLocError("Couldn't get your location — check site permissions, or try 'Pick on map' instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleResolveLink = async () => {
    if (!mapsLink.trim()) return;
    setResolvingLink(true);
    setLinkError(null);
    try {
      const res = await api.resolveMapsLink(mapsLink.trim());
      await applyPin(res.lat, res.lng);
      setMapsLink("");
      setShowMap(true); // show the pin on the map so they can fine-tune it
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setResolvingLink(false);
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
          <label className="ap-field">
            <span className="ap-field-label">Label</span>
            <input
              className="ap-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home, Work, ..."
              maxLength={40}
            />
          </label>
          <label className="ap-field">
            <span className="ap-field-label">Address</span>
            <textarea
              className="ap-input ap-textarea"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House / flat, street, landmark"
            />
          </label>
          <div className="address-locate-row">
            <button type="button" className="address-locate-btn" onClick={handleUseLocation} disabled={locating}>
              <i className="ti ti-current-location" aria-hidden="true" />
              {locating ? "Getting your location…" : "Use my current location"}
            </button>
            <button type="button" className="address-locate-btn" onClick={() => setShowMap((s) => !s)}>
              <i className="ti ti-map-2" aria-hidden="true" />
              {showMap ? "Hide map" : "Pick on map"}
            </button>
          </div>
          {locError && <p className="ap-error">{locError}</p>}

          <div className="address-link-row">
            <input
              className="ap-input"
              value={mapsLink}
              onChange={(e) => setMapsLink(e.target.value)}
              placeholder="Paste a Google Maps link"
            />
            <button type="button" className="address-link-btn" onClick={handleResolveLink} disabled={resolvingLink || !mapsLink.trim()}>
              {resolvingLink ? "…" : "Use link"}
            </button>
          </div>
          {linkError && <p className="ap-error">{linkError}</p>}

          {showMap && (
            <MapPicker lat={lat} lng={lng} onPick={applyPin} />
          )}

          {lat !== null && lng !== null && (
            <p className="ap-note">
              <i className="ti ti-map-pin" aria-hidden="true" style={{ fontSize: 13, marginRight: 4 }} />
              Pinned location attached — the shop can open it on a map.
            </p>
          )}
          <label className="ap-field">
            <span className="ap-field-label">
              Phone for this address <span className="ap-field-hint">· optional, falls back to the number below</span>
            </span>
            <input
              className="ap-input"
              value={addrPhone}
              onChange={(e) => setAddrPhone(e.target.value)}
              placeholder={fallbackPhone || ""}
            />
          </label>
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
        .address-locate-row { display: flex; gap: 8px; }
        .address-locate-btn {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; border-radius: 12px;
          border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font: 600 13.5px var(--font-body);
        }
        .address-locate-btn:disabled { opacity: 0.6; }
        .address-link-row { display: flex; gap: 8px; }
        .address-link-row .ap-input { flex: 1; min-height: 44px; }
        .address-link-btn {
          flex-shrink: 0; padding: 0 16px; border-radius: 12px; border: 1px solid var(--border);
          background: var(--surface-1); color: var(--green); font: 600 13.5px var(--font-body); cursor: pointer;
        }
        .address-link-btn:disabled { opacity: 0.6; cursor: default; }
        .address-save-check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-primary); }
        .address-save-check input { width: 18px; height: 18px; accent-color: var(--green); }

        /* Self-contained field styling — this component is dropped into pages
           (Order.jsx, MyAccount.jsx) that may or may not already define a
           ".field" convention of their own, so it never borrows one. */
        .ap-field { display: flex; flex-direction: column; gap: 6px; }
        .ap-field-label { font-size: 13.5px; font-weight: 600; }
        .ap-field-hint { font-weight: 400; color: var(--text-secondary); }
        .ap-input {
          width: 100%; min-height: 46px; padding: 10px 14px; font: 400 15px var(--font-body); color: var(--text-primary);
          border: 1px solid var(--border); border-radius: 12px; background: var(--surface-1); box-sizing: border-box;
        }
        .ap-input:focus { border-color: var(--green); outline: none; }
        .ap-textarea { resize: vertical; }
        .ap-error { margin: 0; font-size: 13.5px; color: var(--red); }
        .ap-note { margin: 0; font-size: 13px; color: var(--text-secondary); display: flex; align-items: center; }
      `}</style>
    </div>
  );
}
