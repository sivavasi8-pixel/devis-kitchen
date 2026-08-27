import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

// Where to send someone who's logged in but not allowed on the page they hit —
// must never point at another role-gated route, or a mismatched role loops forever.
const homeForRole = (role) => (role === "customer" ? "/order" : role === "rider" ? "/rider" : "/");

export default function ProtectedRoute({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return null; // avoid a login flash while a saved session is being verified

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }
  return children;
}
