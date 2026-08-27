const pushTokens = require("../data/pushTokens");
const asyncHandler = require("../middleware/asyncHandler");

exports.register = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token is required" });
  await pushTokens.register(req.user.id, token);
  res.status(201).json({ ok: true });
});

// Called when a user taps "turn off" on the notifications toggle — removes
// just this device's token, not every token this user has registered.
exports.unregister = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token is required" });
  await pushTokens.unregister(token);
  res.json({ ok: true });
});
