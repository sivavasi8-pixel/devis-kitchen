const jwt = require("jsonwebtoken");

// Dev-only fallback secret — set JWT_SECRET in the environment for anything real.
const JWT_SECRET = process.env.JWT_SECRET || "foodapp-dev-secret-do-not-use-in-prod";

function signToken(user) {
  return jwt.sign({ sub: user.id, name: user.name, role: user.role, staffId: user.staffId || null }, JWT_SECRET, {
    expiresIn: "7d"
  });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Login required" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, name: payload.name, role: payload.role, staffId: payload.staffId };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

// roles: 'owner' | 'staff' | 'rider' | 'customer'
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Login required" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have access to this" });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole, JWT_SECRET };
