import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import AddressPicker from "../components/AddressPicker";

const PHONE_RE = /^[+\d][\d\s-]{6,19}$/;

function ProfileSection() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (phone.trim() && !PHONE_RE.test(phone.trim())) {
      setError("Enter a valid phone number");
      return;
    }
    setSaving(true);
    try {
      const { user: updated } = await api.updateProfile(name.trim(), phone.trim());
      updateUser(updated);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="acct-section">
      <h2 className="acct-section-title">Profile</h2>
      <label className="acct-field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required className="acct-input" />
      </label>
      <label className="acct-field">
        <span>Phone</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="acct-input" />
      </label>
      <label className="acct-field">
        <span>Email <em>· can't be changed here</em></span>
        <input value={user?.email || ""} disabled className="acct-input acct-input-disabled" />
      </label>
      {error && <p className="acct-error">{error}</p>}
      {saved && <p className="acct-ok">✓ Saved.</p>}
      <button type="submit" disabled={saving} className="acct-btn">
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="acct-collapsible">
      <button type="button" className="acct-collapsible-head" onClick={() => setOpen((o) => !o)}>
        <span>Change password</span>
        <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"}`} aria-hidden="true" />
      </button>
      {open && (
        <form onSubmit={handleSubmit} className="acct-collapsible-body">
          <input
            type="password"
            placeholder="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className="acct-input"
          />
          <input
            type="password"
            placeholder="New password (8+ characters)"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
            className="acct-input"
          />
          {error && <p className="acct-error">{error}</p>}
          {done && <p className="acct-ok">✓ Password updated.</p>}
          <button type="submit" disabled={busy} className="acct-btn acct-btn-sm">
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}

function ChangePin() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(next)) {
      setError("PIN must be exactly 6 digits");
      return;
    }
    setBusy(true);
    try {
      await api.changePin(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="acct-collapsible">
      <button type="button" className="acct-collapsible-head" onClick={() => setOpen((o) => !o)}>
        <span>Change PIN</span>
        <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"}`} aria-hidden="true" />
      </button>
      {open && (
        <form onSubmit={handleSubmit} className="acct-collapsible-body">
          <input
            type="password"
            placeholder="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className="acct-input"
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="New 6-digit PIN"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            className="acct-input"
          />
          {error && <p className="acct-error">{error}</p>}
          {done && <p className="acct-ok">✓ PIN updated.</p>}
          <button type="submit" disabled={busy} className="acct-btn acct-btn-sm">
            {busy ? "Updating…" : "Update PIN"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function MyAccount() {
  return (
    <div className="page acct-page">
      <h1 className="page-title">My Account</h1>

      <ProfileSection />

      <section className="acct-section">
        <h2 className="acct-section-title">Security</h2>
        <ChangePassword />
        <ChangePin />
      </section>

      <section className="acct-section">
        <h2 className="acct-section-title">Saved addresses</h2>
        <AddressPicker onChange={() => {}} />
      </section>

      <style>{`
        .acct-page { max-width: 480px; margin: 0 auto; padding: 20px 16px 90px; display: flex; flex-direction: column; gap: 22px; }
        .acct-section { display: flex; flex-direction: column; gap: 12px; }
        .acct-section-title { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary); }
        .acct-field { display: flex; flex-direction: column; gap: 5px; font-size: 13.5px; font-weight: 600; }
        .acct-field em { font-weight: 400; font-style: normal; color: var(--text-secondary); }
        .acct-input {
          min-height: 46px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 12px;
          font-size: 14px; color: var(--text-primary); background: var(--surface-1); box-sizing: border-box; font-family: var(--font-body);
        }
        .acct-input-disabled { background: var(--surface-2); color: var(--text-secondary); }
        .acct-error { margin: 0; font-size: 13px; color: var(--red); }
        .acct-ok { margin: 0; font-size: 13px; color: var(--green); }
        .acct-btn {
          align-self: flex-start; min-height: 44px; padding: 0 20px; border: none; border-radius: 12px;
          background: var(--green); color: var(--cream); font-weight: 700; font-size: 14px; cursor: pointer;
        }
        .acct-btn-sm { min-height: 38px; padding: 0 16px; font-size: 13px; }
        .acct-collapsible { border: 1px solid var(--border); border-radius: 12px; background: var(--surface-1); overflow: hidden; }
        .acct-collapsible-head {
          width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 14px 16px;
          border: none; background: none; font-weight: 600; font-size: 14px; cursor: pointer; color: var(--text-primary);
        }
        .acct-collapsible-body { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px; }
      `}</style>
    </div>
  );
}
