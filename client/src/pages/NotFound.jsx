import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div style={{ padding: "28px", maxWidth: "380px", margin: "60px auto", textAlign: "center" }}>
      <h1 style={{ fontSize: "22px", marginBottom: "8px" }}>Page not found</h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
        That page doesn't exist, or the link may be out of date.
      </p>
      <Link
        to="/order"
        style={{
          display: "inline-block",
          padding: "10px 20px",
          fontSize: "13px",
          background: "var(--green)",
          color: "var(--cream)",
          borderRadius: "8px",
          textDecoration: "none"
        }}
      >
        Go to the menu
      </Link>
    </div>
  );
}
