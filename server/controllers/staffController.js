const staff = require("../data/staff");
const users = require("../data/users");
const asyncHandler = require("../middleware/asyncHandler");

exports.getStaff = asyncHandler(async (req, res) => {
  res.json({ staff: await staff.getAll() });
});

exports.getRiders = asyncHandler(async (req, res) => {
  res.json({ riders: await staff.getRiders() });
});

exports.createStaff = asyncHandler(async (req, res) => {
  const { name, role, shift, isRider, email, password } = req.body;
  if (!name || !role || !shift) return res.status(400).json({ error: "name, role and shift are required" });
  if ((email && !password) || (!email && password)) {
    return res.status(400).json({ error: "email and password must be provided together, or not at all" });
  }
  if (email) {
    if (password.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });
    // Checked before the roster row is created so a duplicate email can't leave
    // an orphaned staff entry with no account behind it.
    if (await users.findByEmail(email)) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }
  }
  const entry = await staff.create({ name, role, shift, isRider, email, password });
  res.status(201).json({ staff: entry });
});

exports.deleteStaff = asyncHandler(async (req, res) => {
  await staff.remove(req.params.id);
  res.status(204).end();
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const valid = ["clocked_in", "clocked_out", "on_break", "absent"];
  if (!valid.includes(status)) return res.status(400).json({ error: `status must be one of ${valid.join(", ")}` });
  // Staff clock themselves in/out; only the owner can change someone else's status.
  if (req.user.role === "staff") {
    const me = await users.findById(req.user.id);
    if (!me || me.staffId !== Number(req.params.id)) {
      return res.status(403).json({ error: "You can only update your own status. Ask the owner to change others." });
    }
  }
  const person = await staff.updateStatus(req.params.id, status);
  if (!person) return res.status(404).json({ error: "Staff member not found" });
  res.json({ staff: person });
});

exports.updateShift = asyncHandler(async (req, res) => {
  const { shift } = req.body;
  if (!shift) return res.status(400).json({ error: "shift is required" });
  res.json({ staff: await staff.updateShift(req.params.id, shift) });
});

// Tasks

exports.getTasks = asyncHandler(async (req, res) => {
  res.json({ tasks: await staff.getTasks() });
});

exports.createTask = asyncHandler(async (req, res) => {
  const { description, assignedTo, due } = req.body;
  if (!description || !assignedTo || !due) {
    return res.status(400).json({ error: "description, assignedTo and due are required" });
  }
  res.status(201).json({ task: await staff.createTask({ description, assignedTo, due }) });
});

exports.updateTask = asyncHandler(async (req, res) => {
  const task = await staff.updateTask(req.params.id, req.body);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task });
});

exports.deleteTask = asyncHandler(async (req, res) => {
  await staff.removeTask(req.params.id);
  res.status(204).end();
});
