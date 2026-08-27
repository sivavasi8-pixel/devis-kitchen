const bcrypt = require("bcryptjs");
const users = require("../data/users");
const { signToken } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, staffId: u.staffId });

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  const user = await users.findByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

exports.signup = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "password must be at least 6 characters" });
  }
  if (await users.findByEmail(email)) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }
  // Signup only ever creates customer accounts — owner/staff/rider accounts are seeded/added by the owner.
  const user = await users.createCustomer({ name, email, passwordHash: bcrypt.hashSync(password, 10), phone });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await users.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user) });
});
