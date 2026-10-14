import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import QrCode from "./QrCode";

// Shown for an unpaid order once the shop has a UPI ID configured (Settings
// page) — a real QR + "pa=" deep link built from the actual order amount, plus
// a way to upload proof of payment. Doesn't touch payment_status itself:
// "Mark paid" on the admin side stays the one action that actually confirms it.
export default function PayWithUpi({ order, settings }) {
  const [hasReceipt, setHasReceipt] = useState(order.hasReceipt);
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!hasReceipt) {
      setReceiptUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl = null;
    api
      .getReceiptBlob(order.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setReceiptUrl(objectUrl);
      })
      .catch(() => {}); // the upload itself already succeeded — a failed re-fetch just skips the preview
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasReceipt, order.id]);

  if (!settings?.upiVpa || order.paymentStatus === "paid") return null;

  const payeeName = settings.upiPayeeName || "Devi's Kitchen";
  const upiLink = `upi://pay?pa=${encodeURIComponent(settings.upiVpa)}&pn=${encodeURIComponent(payeeName)}&am=${order.total}&cu=INR&tn=${encodeURIComponent(`Order ${order.id}`)}`;

  const copyVpa = async () => {
    try {
      await navigator.clipboard.writeText(settings.upiVpa);
    } catch {
      // clipboard blocked — the VPA is already shown as plain text to copy by hand
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { order: updated } = await api.uploadReceipt(order.id, file);
      setHasReceipt(updated.hasReceipt);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="upi-pay-card">
      <p className="upi-pay-title">Pay ₹{order.total} via UPI</p>
      <QrCode value={upiLink} size={150} />
      <div className="upi-vpa-row">
        <span>{settings.upiVpa}</span>
        <button type="button" onClick={copyVpa}>Copy</button>
      </div>
      <p className="upi-pay-note">Scan with any UPI app, or tap below on this phone</p>
      <a href={upiLink} className="upi-pay-btn">Pay with UPI app</a>

      <div className="upi-receipt">
        {hasReceipt ? (
          <>
            <p className="upi-receipt-status">
              <i className="ti ti-circle-check" aria-hidden="true" /> Receipt uploaded — awaiting the shop's review
            </p>
            {receiptUrl && <img src={receiptUrl} alt="Uploaded payment receipt" className="upi-receipt-thumb" />}
            <label className="upi-receipt-link">
              {busy ? "Uploading…" : "Replace receipt"}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} disabled={busy} hidden />
            </label>
          </>
        ) : (
          <label className="upi-receipt-upload">
            <i className="ti ti-upload" aria-hidden="true" />
            {busy ? "Uploading…" : "Upload payment receipt"}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} disabled={busy} hidden />
          </label>
        )}
        {error && <p className="upi-receipt-error">{error}</p>}
      </div>

      <style>{`
        .upi-pay-card {
          background: var(--surface-1, #fff); border: 1px solid var(--border); border-radius: var(--radius-lg, 16px);
          padding: 18px; display: flex; flex-direction: column; align-items: center; gap: 8px;
        }
        .upi-pay-title { margin: 0; font-weight: 700; font-family: var(--font-display); font-size: 18px; }
        .upi-vpa-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
        .upi-vpa-row span { font-weight: 700; color: var(--green); font-size: 14px; }
        .upi-vpa-row button {
          border: 1px solid var(--border); background: var(--surface-1, #fff); border-radius: 8px; padding: 3px 10px;
          font-size: 11.5px; font-weight: 600; color: var(--green); cursor: pointer;
        }
        .upi-pay-note { margin: 0; font-size: 12.5px; color: var(--text-secondary); text-align: center; }
        .upi-pay-btn {
          width: 100%; box-sizing: border-box; margin-top: 4px; min-height: 46px; border-radius: 12px; background: var(--green);
          color: var(--cream); font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center;
          text-decoration: none;
        }
        .upi-receipt { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 10px; padding-top: 14px; border-top: 1px solid var(--border); }
        .upi-receipt-upload, .upi-receipt-link {
          display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; box-sizing: border-box;
          min-height: 46px; border: 1px dashed var(--border); border-radius: 12px; color: var(--green); font-weight: 600;
          font-size: 13.5px; cursor: pointer;
        }
        .upi-receipt-link { border-style: solid; width: auto; padding: 0 16px; min-height: 36px; font-size: 12.5px; }
        .upi-receipt-status { margin: 0; font-size: 13px; font-weight: 600; color: var(--green); display: flex; align-items: center; gap: 6px; }
        .upi-receipt-thumb { max-width: 160px; max-height: 160px; border-radius: 10px; border: 1px solid var(--border); object-fit: cover; }
        .upi-receipt-error { margin: 0; font-size: 12.5px; color: var(--red); }
      `}</style>
    </div>
  );
}
