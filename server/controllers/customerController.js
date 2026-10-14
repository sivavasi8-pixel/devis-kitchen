const bcrypt = require("bcryptjs");
const users = require("../data/users");
const asyncHandler = require("../middleware/asyncHandler");

// Shape exposed to the admin UI — no hashes, but includes the PIN-reset flag.
const adminView = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone ?? null,
  pinSet: Boolean(u.pinHash),
  pinResetRequestedAt: u.pinResetRequestedAt ?? null
});

// GET /api/customers — all customer accounts; available to owner + staff.
exports.listCustomers = asyncHandler(async (req, res) => {
  const all = await users.getAllCustomers();
  res.json({ customers: all.map(adminView) });
});

// POST /api/customers/:id/reset-pin — admin sets a new PIN on behalf of a customer.
// Clears the pin_reset_requested_at flag atomically.
exports.adminResetPin = asyncHandler(async (req, res) => {
  const { newPin } = req.body;
  if (!newPin) return res.status(400).json({ error: "newPin is required" });
  if (!/^\d{6}$/.test(newPin)) return res.status(400).json({ error: "PIN must be exactly 6 digits" });

  const user = await users.findById(req.params.id);
  if (!user || user.role !== "customer") {
    return res.status(404).json({ error: "Customer not found" });
  }
  const updated = await users.adminSetPin(user.id, bcrypt.hashSync(newPin, 10));
  res.json({ customer: adminView(updated) });
});

// POST /api/customers/:id/reset-password — admin sets a new password for a customer.
// Replaces the old set-password.js script for day-to-day use.
exports.adminResetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ error: "newPassword is required" });
  if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const user = await users.findById(req.params.id);
  if (!user || user.role !== "customer") {
    return res.status(404).json({ error: "Customer not found" });
  }
  await users.adminSetPassword(user.id, bcrypt.hashSync(newPassword, 10));
  res.json({ message: "Password updated." });
});
