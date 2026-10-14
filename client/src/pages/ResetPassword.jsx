import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  fontSize: "13px",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  marginBottom: "12px",
  boxSizing: "border-box"
};

export default function ResetPassword() {
  // "reset" — self-service with PIN; "request" — ask admin to reset PIN
  const [mode, setMode] = useState("reset");

  // Reset-with-PIN form
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState(null);
  const [resetDone, setResetDone] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  // Request-admin-help form
  const [reqEmail, setReqEmail] = useState("");
  const [reqError, setReqError] = useState(null);
  const [reqDone, setReqDone] = useState(false);
  const [reqBusy, setReqBusy] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setResetError(null);
    if (!/^\d{6}$/.test(pin)) {
      setResetError("PIN must be 6 digits");
      return;
    }
    if (newPassword.length < 8) {
      setResetError("New password must be at least 8 characters");
      return;
    }
    setResetBusy(true);
    try {
      await api.resetPassword(email, pin, newPassword);
      setResetDone(true);
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetBusy(false);
    }
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    setReqError(null);
    setReqBusy(true);
    try {
      await api.requestPinReset(reqEmail);
      setReqDone(true);
    } catch (err) {
      setReqError(err.message);
    } finally {
      setReqBusy(false);
    }
  };

  return (
    <div style={{ padding: "28px", maxWidth: "380px", margin: "40px auto" }}>
      {mode === "reset" ? (
        <>
          <h1 style={{ fontSize: "22px", marginBottom: "4px" }}>Reset your password</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
            Enter your email, your 6-digit PIN, and a new password — no admin needed.
          </p>

          {resetDone ? (
            <div
              style={{
                padding: "14px 16px",
                background: "var(--surface-2)",
                borderRadius: "var(--radius)",
                fontSize: "13px",
                marginBottom: "16px"
              }}
            >
              ✅ Password updated — you can now{" "}
              <Link to="/login" style={{ color: "var(--green)" }}>log in</Link> with your new password.
            </div>
          ) : (
            <form onSubmit={handleReset}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                required
              />
              <input
                type="password"
                placeholder="Your 6-digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                style={inputStyle}
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
              />
              <input
                type="password"
                placeholder="New password (min 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={inputStyle}
                required
                minLength={8}
              />
              {resetError && (
                <p style={{ color: "var(--red)", fontSize: "13px", marginBottom: "12px" }}>{resetError}</p>
              )}
              <button
                type="submit"
                disabled={resetBusy}
                style={{
                  width: "100%",
                  padding: "10px",
                  fontSize: "13px",
                  background: "var(--green)",
                  color: "var(--cream)",
                  border: "none",
                  borderRadius: "8px"
                }}
              >
                {resetBusy ? "Updating…" : "Set new password"}
              </button>
            </form>
          )}

          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "16px" }}>
            Forgotten your PIN too?{" "}
            <button
              onClick={() => setMode("request")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--green)",
                fontSize: "12px",
                cursor: "pointer",
                textDecoration: "underline"
              }}
            >
              Request help from the store
            </button>
          </p>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
            Remembered it? <Link to="/login" style={{ color: "var(--green)" }}>Back to log in</Link>
          </p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: "22px", marginBottom: "4px" }}>Request PIN reset</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
            Enter your email and we'll flag your account so the store can reset your PIN for you.
            No email or SMS is sent — the team will reach out via your usual contact.
          </p>

          {reqDone ? (
            <div
              style={{
                padding: "14px 16px",
                background: "var(--surface-2)",
                borderRadius: "var(--radius)",
                fontSize: "13px",
                marginBottom: "16px"
              }}
            >
              ✅ Request sent — the store will be in touch to help you reset your PIN.
              Once it's reset, come back and{" "}
              <button
                onClick={() => { setMode("reset"); setReqDone(false); setReqEmail(""); }}
                style={{
                  background: "none", border: "none", padding: 0,
                  color: "var(--green)", fontSize: "13px", cursor: "pointer", textDecoration: "underline"
                }}
              >
                reset your password here
              </button>.
            </div>
          ) : (
            <form onSubmit={handleRequest}>
              <input
                type="email"
                placeholder="Email"
                value={reqEmail}
                onChange={(e) => setReqEmail(e.target.value)}
                style={inputStyle}
                required
              />
              {reqError && (
                <p style={{ color: "var(--red)", fontSize: "13px", marginBottom: "12px" }}>{reqError}</p>
              )}
              <button
                type="submit"
                disabled={reqBusy}
                style={{
                  width: "100%",
                  padding: "10px",
                  fontSize: "13px",
                  background: "var(--green)",
                  color: "var(--cream)",
                  border: "none",
                  borderRadius: "8px"
                }}
              >
                {reqBusy ? "Sending…" : "Request help from the store"}
              </button>
            </form>
          )}

          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "16px" }}>
            <button
              onClick={() => setMode("reset")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--green)",
                fontSize: "12px",
                cursor: "pointer",
                textDecoration: "underline"
              }}
            >
              ← Back
            </button>
          </p>
        </>
      )}
    </div>
  );
}
