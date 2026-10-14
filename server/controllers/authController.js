const bcrypt = require("bcryptjs");
const users = require("../data/users");
const { signToken, isProduction } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");

// The demo passwords are published in this repo's README and schema.sql, so on the
// live site they're as good as no password. Production refuses them outright; set a
// real one with `node scripts/set-password.js <email> <new-password>`.
const PUBLISHED_DEMO_PASSWORDS = ["owner123", "staff123", "rider123", "customer123"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose on purpose — covers Indian mobile numbers with or without a country code,
// and doesn't reject landlines or formatting like spaces/dashes outright.
const PHONE_RE = /^[+\d][\d\s-]{6,19}$/;

// staffId links a staff/rider login to its roster row.
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  phone: u.phone ?? null,
  staffId: u.staffId ?? null
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  const user = await users.findByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (isProduction && PUBLISHED_DEMO_PASSWORDS.includes(password)) {
    return res.status(403).json({
      error: "This account still uses a public demo password, so it's been locked. Set a new password to sign in."
    });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

exports.signup = asyncHandler(async (req, res) => {
  const { name, email, password, phone, pin } = req.body;
  if (!name || !email || !password || !phone || !pin) {
    return res.status(400).json({ error: "name, email, phone, password and PIN are required" });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (!PHONE_RE.test(phone.trim())) {
    return res.status(400).json({ error: "Enter a valid phone number" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }
  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: "PIN must be exactly 6 digits" });
  }
  if (await users.findByEmail(email)) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }
  // Signup only ever creates customer accounts — owner/staff/rider accounts are seeded/added by the owner.
  const user = await users.createCustomer({
    name,
    email,
    phone: phone.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    pinHash: bcrypt.hashSync(pin, 10)
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await users.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user) });
});

// Self-service: a logged-in user editing their own name/phone (My Account).
// Email is deliberately not editable here — changing it safely needs its own
// re-verification flow, which doesn't exist yet.
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
  if (phone && !PHONE_RE.test(phone.trim())) {
    return res.status(400).json({ error: "Enter a valid phone number" });
  }
  const updated = await users.updateProfile(req.user.id, { name: name.trim(), phone: phone ? phone.trim() : null });
  res.json({ user: publicUser(updated) });
});

// Self-service password change for an already logged-in user — distinct from
// resetPassword (forgot-password-via-PIN, works while logged out): this
// requires the CURRENT password, same "prove you're really you" rule a stolen
// session token alone shouldn't bypass for something this sensitive.
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword and newPassword are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  if (PUBLISHED_DEMO_PASSWORDS.includes(newPassword)) {
    return res.status(400).json({ error: "That password is publicly known. Please choose a different one." });
  }
  const user = await users.findById(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }
  await users.resetPassword(user.id, bcrypt.hashSync(newPassword, 10));
  res.json({ message: "Password updated." });
});

// Self-service PIN change — same current-password check as changePassword.
// Customer-only: staff/owner/rider accounts have no PIN to change.
exports.changePin = asyncHandler(async (req, res) => {
  const { currentPassword, newPin } = req.body;
  if (!currentPassword || !newPin) {
    return res.status(400).json({ error: "currentPassword and newPin are required" });
  }
  if (!/^\d{6}$/.test(newPin)) {
    return res.status(400).json({ error: "PIN must be exactly 6 digits" });
  }
  const user = await users.findById(req.user.id);
  if (user.role !== "customer") {
    return res.status(403).json({ error: "Only customer accounts have a PIN" });
  }
  if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }
  await users.adminSetPin(user.id, bcrypt.hashSync(newPin, 10));
  res.json({ message: "PIN updated." });
});

// Self-service: customer provides email + PIN + new password — no admin needed.
// Rate-limited via the authLimiter in index.js (same window as /login).
exports.resetPassword = asyncHandler(async (req, res) => {
  const { email, pin, newPassword } = req.body;
  if (!email || !pin || !newPassword) {
    return res.status(400).json({ error: "email, pin and newPassword are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  const user = await users.findByEmail(email);
  // Deliberately vague so you can't enumerate accounts.
  if (!user || user.role !== "customer" || !user.pinHash || !bcrypt.compareSync(pin, user.pinHash)) {
    return res.status(401).json({ error: "Email or PIN is incorrect" });
  }
  await users.resetPassword(user.id, bcrypt.hashSync(newPassword, 10));
  res.json({ message: "Password updated — you can now log in with your new password." });
});

// Customer can't remember their PIN → flag the account for admin attention.
// No auth required (they're locked out); email identifies the account.
exports.requestPinReset = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });
  const user = await users.findByEmail(email);
  // Always respond 200 — don't reveal whether an account exists for that email.
  if (user && user.role === "customer") {
    await users.requestPinReset(user.id);
  }
  res.json({ message: "Request noted — the restaurant will be in touch to help you reset your PIN." });
});
