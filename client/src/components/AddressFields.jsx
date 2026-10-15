import { useState } from "react";
import { api } from "../api";
import MapPicker from "./MapPicker";

// The address form itself: label, address text, "use my location" / map pin / pasted Google
// Maps link, and a phone. Controlled: the parent owns `value` ({ label, address, phone, lat, lng })
// and receives partial updates through onChange(patch). Used by the checkout picker (new address)
// and by the My Account address book (add and edit), so both behave identically.
export default function AddressFields({ value, onChange, fallbackPhone }) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [mapsLink, setMapsLink] = useState("");
  const [resolvingLink, setResolvingLink] = useState(false);
  const [linkError, setLinkError] = useState(null);

  // Shared by all three ways to get a pin (GPS, the map, a pasted link): each only supplies the
  // coordinates, and filling in the address text (best effort) happens in one place.
  const applyPin = async (lat, lng) => {
    onChange({ lat, lng });
    try {
      const res = await api.reverseGeocode(lat, lng);
      if (res.address) onChange({ address: res.address });
    } catch {
      // Lat/lng alone still helps staff find the drop point even without a label.
    }
  };

  const handleUseLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocError("Location isn't supported in this browser. Try 'Pick on map' or type your address instead.");
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
        setLocError("Couldn't get your location. Check site permissions, or try 'Pick on map' instead.");
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
      setShowMap(true); // show the pin so they can fine-tune it
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setResolvingLink(false);
    }
  };

  const hasPin = value.lat !== null && value.lat !== undefined && value.lng !== null && value.lng !== undefined;

  return (
    <div className="af">
      <label className="ap-field">
        <span className="ap-field-label">Label</span>
        <input
          className="ap-input"
          value={value.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Home, Work, ..."
          maxLength={40}
        />
      </label>
      <label className="ap-field">
        <span className="ap-field-label">Address</span>
        <textarea
          className="ap-input ap-textarea"
          rows={2}
          value={value.address}
          onChange={(e) => onChange({ address: e.target.value })}
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

      {showMap && <MapPicker lat={hasPin ? value.lat : null} lng={hasPin ? value.lng : null} onPick={applyPin} />}

      {hasPin && (
        <p className="ap-note">
          <i className="ti ti-map-pin" aria-hidden="true" style={{ fontSize: 13, marginRight: 4 }} />
          Pinned location attached. The restaurant can open it on a map.
        </p>
      )}
      <label className="ap-field">
        <span className="ap-field-label">
          Phone for this address <span className="ap-field-hint">· optional{fallbackPhone ? ", falls back to the number below" : ""}</span>
        </span>
        <input
          className="ap-input"
          value={value.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          placeholder={fallbackPhone || ""}
        />
      </label>

      <style>{`
        .af { display: flex; flex-direction: column; gap: 10px; }
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

        /* Self-contained field styling: this component is dropped into pages that may or may not
           define a ".field" convention of their own, so it never borrows one. */
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
        @media (max-width: 420px) { .address-locate-row { flex-direction: column; } }
      `}</style>
    </div>
  );
}
