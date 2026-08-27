import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  fontSize: "13px",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  marginBottom: "12px",
  boxSizing: "border-box"
};

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup(name, email, password, phone);
      navigate("/order");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: "28px", maxWidth: "380px", margin: "40px auto" }}>
      <h1 style={{ fontSize: "22px", marginBottom: "4px" }}>Create an account</h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
        For customers placing orders online. Owner, staff, and rider accounts are set up separately.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          required
        />
        <input
          type="tel"
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          required
          minLength={6}
        />
        {error && <p style={{ color: "var(--red)", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}
        <button
          type="submit"
          disabled={submitting}
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
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "16px" }}>
        Already have an account? <Link to="/login" style={{ color: "var(--green)" }}>Log in</Link>
      </p>
    </div>
  );
}
