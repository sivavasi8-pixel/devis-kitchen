import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
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

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      const from = location.state?.from;
      const roleHome = user.role === "customer" ? "/order" : user.role === "rider" ? "/rider" : "/";
      navigate(from || roleHome);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: "28px", maxWidth: "380px", margin: "40px auto" }}>
      <h1 style={{ fontSize: "22px", marginBottom: "4px" }}>Log in</h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
        Owner, staff, rider, and customer accounts all sign in here.
      </p>

      <form onSubmit={handleSubmit}>
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
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          required
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
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "16px" }}>
        New customer? <Link to="/signup" style={{ color: "var(--green)" }}>Create an account</Link>
      </p>

      {import.meta.env.DEV && (
        <div
          style={{
            marginTop: "24px",
            padding: "12px 14px",
            background: "var(--surface-2)",
            borderRadius: "var(--radius)",
            fontSize: "11px",
            color: "var(--text-secondary)"
          }}
        >
          <strong>Dev seed logins:</strong>
          <br />
          Owner — owner@devis.test / owner123
          <br />
          Staff — divya@devis.test / staff123
          <br />
          Rider — manoj@devis.test / staff123
          <br />
          Customer — ananya@example.com / customer123
        </div>
      )}
    </div>
  );
}
