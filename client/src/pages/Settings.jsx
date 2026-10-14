import { useEffect, useState } from "react";
import { api } from "../api";
import MapPicker from "../components/MapPicker";
import OrderingSettings from "../components/admin/OrderingSettings";

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [upiVpa, setUpiVpa] = useState("");
  const [upiPayeeName, setUpiPayeeName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  const [shopAddress, setShopAddress] = useState("");
  const [shopLat, setShopLat] = useState(null);
  const [shopLng, setShopLng] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [mapsLink, setMapsLink] = useState("");
  const [resolvingLink, setResolvingLink] = useState(false);
  const [linkError, setLinkError] = useState(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationSaveError, setLocationSaveError] = useState(null);
  const [locationSaved, setLocationSaved] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setUpiVpa(s.upiVpa || "");
        setUpiPayeeName(s.upiPayeeName || "");
        setShopAddress(s.shopAddress || "");
        setShopLat(s.shopLat ? Number(s.shopLat) : null);
        setShopLng(s.shopLng ? Number(s.shopLng) : null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api.updateSettings({ upiVpa, upiPayeeName });
      setSaved(true);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Shared by all three ways to get a pin — GPS, the map, or a pasted link —
  // so each only sets the coordinates; filling in the address text (when it's
  // still empty) happens in one place.
  const applyPin = async (lat, lng) => {
    setShopLat(lat);
    setShopLng(lng);
    if (!shopAddress.trim()) {
      try {
        const res = await api.reverseGeocode(lat, lng);
        if (res.address) setShopAddress(res.address);
      } catch {
        // Not critical — the pin itself is what matters for distance calc.
      }
    }
  };

  const handleUseLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocError("Location isn't supported in this browser — try 'Pick on map' or just save the address below.");
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
      setShowMap(true);
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setResolvingLink(false);
    }
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    setLocationSaveError(null);
    setLocationSaved(false);
    setSavingLocation(true);
    try {
      const payload = { shopAddress };
      // Only send lat/lng if "Use my current location" actually set them —
      // otherwise the server forward-geocodes the typed address itself.
      if (shopLat != null && shopLng != null) {
        payload.shopLat = shopLat;
        payload.shopLng = shopLng;
      }
      const updated = await api.updateSettings(payload);
      setShopLat(updated.shopLat ? Number(updated.shopLat) : null);
      setShopLng(updated.shopLng ? Number(updated.shopLng) : null);
      setLocationSaved(true);
    } catch (err) {
      setLocationSaveError(err.message);
    } finally {
      setSavingLocation(false);
    }
  };

  if (loading) return <div style={{ padding: "32px", color: "var(--a-text-secondary)" }}>Loading…</div>;
  if (error) return <div style={{ padding: "32px", color: "var(--a-danger-text)" }}>{error}</div>;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 560, display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ fontSize: "22px", marginBottom: "4px" }}>Settings</h1>
        <p style={{ color: "var(--a-text-secondary)", fontSize: "13px" }}>
          Shop-wide configuration — not code, so it's safe to update any time your details change.
        </p>
      </div>

      <form onSubmit={handleSaveLocation} style={panelStyle}>
        <h2 style={{ margin: 0, fontSize: "16px" }}>Shop location</h2>
        <p style={{ margin: "-8px 0 0", fontSize: "12.5px", color: "var(--a-text-secondary)" }}>
          Used to calculate delivery distance, fees and "distance from the restaurant" for riders.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <span style={{ fontSize: "13.5px", fontWeight: 600 }}>Address</span>
          <textarea
            value={shopAddress}
            onChange={(e) => setShopAddress(e.target.value)}
            placeholder="Shop name, street, area, city"
            rows={2}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </label>

        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" onClick={handleUseLocation} disabled={locating} style={{ ...locateBtn, flex: 1 }}>
            <i className="ti ti-current-location" aria-hidden="true" />
            {locating ? "Getting your location…" : "Use my current location"}
          </button>
          <button type="button" onClick={() => setShowMap((s) => !s)} style={{ ...locateBtn, flex: 1 }}>
            <i className="ti ti-map-2" aria-hidden="true" />
            {showMap ? "Hide map" : "Pick on map"}
          </button>
        </div>
        {locError && <p style={{ color: "var(--a-danger-text)", fontSize: "12.5px", margin: 0 }}>{locError}</p>}

        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={mapsLink}
            onChange={(e) => setMapsLink(e.target.value)}
            placeholder="Paste a Google Maps link"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" onClick={handleResolveLink} disabled={resolvingLink || !mapsLink.trim()} style={linkBtn}>
            {resolvingLink ? "…" : "Use link"}
          </button>
        </div>
        {linkError && <p style={{ color: "var(--a-danger-text)", fontSize: "12.5px", margin: 0 }}>{linkError}</p>}

        {showMap && <MapPicker lat={shopLat} lng={shopLng} onPick={applyPin} />}

        {shopLat != null && shopLng != null ? (
          <p style={{ margin: 0, fontSize: "12px", color: "var(--a-text-secondary)" }}>
            Pinned at {shopLat.toFixed(5)}, {shopLng.toFixed(5)}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: "12px", color: "var(--a-text-secondary)" }}>
            No precise pin yet — saving just finds an approximate location from the address above. Use the button
            while you're physically at the shop for an exact pin.
          </p>
        )}

        {locationSaveError && <p style={{ color: "var(--a-danger-text)", fontSize: "13px", margin: 0 }}>{locationSaveError}</p>}
        {locationSaved && <p style={{ color: "var(--a-green)", fontSize: "13px", margin: 0 }}>✓ Saved.</p>}

        <button type="submit" disabled={savingLocation} style={submitBtn}>
          {savingLocation ? "Saving…" : "Save shop location"}
        </button>
      </form>

      <OrderingSettings />

      <form onSubmit={handleSave} style={panelStyle}>
        <h2 style={{ margin: 0, fontSize: "16px" }}>Payment · UPI</h2>
        <p style={{ margin: "-8px 0 0", fontSize: "12.5px", color: "var(--a-text-secondary)" }}>
          Customers paying by UPI see a QR code and a direct pay link built from this. Leave it blank to hide the UPI
          pay option on checkout and My Orders.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <span style={{ fontSize: "13.5px", fontWeight: 600 }}>UPI ID (VPA)</span>
          <input
            type="text"
            value={upiVpa}
            onChange={(e) => setUpiVpa(e.target.value)}
            placeholder="yourshop@okhdfcbank"
            style={inputStyle}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <span style={{ fontSize: "13.5px", fontWeight: 600 }}>
            Payee name shown in the customer's UPI app <span style={{ fontWeight: 400, color: "var(--a-text-secondary)" }}>· optional</span>
          </span>
          <input
            type="text"
            value={upiPayeeName}
            onChange={(e) => setUpiPayeeName(e.target.value)}
            placeholder="Devi's Kitchen"
            style={inputStyle}
          />
        </label>

        {saveError && <p style={{ color: "var(--a-danger-text)", fontSize: "13px", margin: 0 }}>{saveError}</p>}
        {saved && <p style={{ color: "var(--a-green)", fontSize: "13px", margin: 0 }}>✓ Saved.</p>}

        <button type="submit" disabled={saving} style={submitBtn}>
          {saving ? "Saving…" : "Save payment settings"}
        </button>
      </form>
    </div>
  );
}

const panelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "14px",
  padding: "18px 20px",
  border: "1px solid var(--a-border)",
  borderRadius: "var(--a-radius-lg, 16px)",
  background: "var(--a-panel)"
};

const inputStyle = {
  minHeight: "44px",
  padding: "9px 13px",
  fontSize: "14px",
  border: "1px solid var(--a-border)",
  borderRadius: "10px",
  boxSizing: "border-box"
};

const locateBtn = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  minHeight: "44px",
  border: "1px solid var(--a-border)",
  borderRadius: "10px",
  background: "var(--a-bg)",
  color: "var(--a-text-primary)",
  fontWeight: 600,
  fontSize: "14px",
  cursor: "pointer"
};

const linkBtn = {
  flexShrink: 0,
  padding: "0 16px",
  border: "1px solid var(--a-border)",
  borderRadius: "10px",
  background: "var(--a-bg)",
  color: "var(--a-green)",
  fontWeight: 600,
  fontSize: "14px",
  cursor: "pointer"
};

const submitBtn = {
  alignSelf: "flex-start",
  padding: "10px 20px",
  fontSize: "14px",
  fontWeight: 600,
  border: "none",
  borderRadius: "10px",
  background: "var(--a-green)",
  color: "#fff",
  cursor: "pointer"
};
