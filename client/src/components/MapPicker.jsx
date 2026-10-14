import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker image paths don't resolve through Vite's bundler —
// point them at the same CDN copy of the package instead of shipping the PNGs.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

const BENGALURU = [12.9716, 77.5946];

// A free, no-API-key map (OpenStreetMap tiles via Leaflet) for picking an exact
// location by clicking or dragging the pin — the alternative to typing an
// address or trusting a GPS fix, for whichever of those two is less precise or
// unavailable right now.
export default function MapPicker({ lat, lng, onPick, height = 220 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    const center = lat != null && lng != null ? [lat, lng] : BENGALURU;
    const map = L.map(elRef.current, { attributionControl: true }).setView(center, lat != null ? 16 : 12);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    const marker = L.marker(center, { draggable: true }).addTo(map);
    markerRef.current = marker;
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onPick(pos.lat, pos.lng);
    });
    map.on("click", (e) => {
      marker.setLatLng(e.latlng);
      onPick(e.latlng.lat, e.latlng.lng);
    });

    // Tiles paint wrong if the container's real size isn't known at creation
    // time (e.g. it was hidden behind a collapsed section a moment ago).
    setTimeout(() => map.invalidateSize(), 0);

    return () => map.remove();
    // Intentionally only on mount — lat/lng updates after that are handled by
    // the effect below, which moves the existing marker instead of rebuilding
    // the whole map (rebuilding would reset the zoom/pan the person just set).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center when lat/lng changes from outside this component (e.g. a
  // sibling "use current location" button, or a pasted link being resolved).
  useEffect(() => {
    if (lat == null || lng == null || !mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 15));
  }, [lat, lng]);

  return (
    <div
      ref={elRef}
      style={{ height, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border, var(--a-border))" }}
    />
  );
}
