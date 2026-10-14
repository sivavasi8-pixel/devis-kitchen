import { useMemo } from "react";
import { makeQr } from "../qr";

// Renders server/../qr.js's bitmap as plain SVG rects — a lighter-weight
// alternative to Poster.jsx's canvas drawing for an inline UI element.
export default function QrCode({ value, size = 160 }) {
  const { qr, cell } = useMemo(() => {
    const qr = makeQr(value);
    return { qr, cell: size / qr.size };
  }, [value, size]);

  const rects = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.isDark(x, y)) rects.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} />);
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="UPI payment QR code">
      <rect width={size} height={size} fill="#ffffff" />
      <g fill="#26241f">{rects}</g>
    </svg>
  );
}
