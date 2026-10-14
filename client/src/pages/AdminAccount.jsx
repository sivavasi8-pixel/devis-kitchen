import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { AdminPage } from "../components/admin/AdminUI";

const ROLE_LABEL = { owner: "Owner", staff: "Staff", rider: "Rider" };

// A signed-in owner, staff member or rider changing their own password. Customers have
// the same thing on their My Account page; the server route is shared and always asks
// for the current password first, so a stolen session alone can't change it.
export default function AdminAccount() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next.length < 8) return setError("New password must be at least 8 characters");
    if (next !== confirm) return setError("The two new passwords don't match");
    if (next === current) return setError("Choose a password different from your current one");
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage eyebrow={`${ROLE_LABEL[user?.role] || "Account"} · ${user?.email}`} title="My account">
      <div className="acct-card">
        <p className="acct-who">
          Signed in as <strong>{user?.name}</strong>
        </p>

        <form onSubmit={handleSubmit} className="acct-form">
          <h2 className="acct-title">Change password</h2>
          <label className="acct-field">
            Current password
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </label>
          <label className="acct-field">
            New password <em>(at least 8 characters)</em>
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
          </label>
          <label className="acct-field">
            Confirm new password
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </label>
          {error && <p className="acct-error" role="alert">{error}</p>}
          {done && <p className="acct-ok" role="status">✓ Password updated. Use it next time you log in.</p>}
          <button type="submit" disabled={busy} className="a-btn primary" style={{ alignSelf: "flex-start" }}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>

      <style>{`
        .acct-card { max-width: 440px; background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius); padding: 18px; display: flex; flex-direction: column; gap: 14px; }
        .acct-who { margin: 0; font-size: 13px; color: var(--a-text-secondary); }
        .acct-who strong { color: var(--a-text-primary); }
        .acct-form { display: flex; flex-direction: column; gap: 12px; }
        .acct-title { margin: 0; font-size: 15px; font-weight: 600; }
        .acct-field { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 600; }
        .acct-field em { font-weight: 400; font-style: normal; color: var(--a-text-secondary); }
        .acct-field input { min-height: 38px; padding: 0 10px; border: 1px solid var(--a-border); border-radius: 8px; font-size: 14px; background: var(--a-panel); color: var(--a-text-primary); }
        .acct-error { margin: 0; font-size: 13px; color: var(--a-danger-text); }
        .acct-ok { margin: 0; font-size: 13px; color: var(--a-success-text); }
      `}</style>
    </AdminPage>
  );
}
