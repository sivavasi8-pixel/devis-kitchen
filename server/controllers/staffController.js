const staff = require("../data/staff");
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
  res.json({ staff: await staff.updateStatus(req.params.id, status) });
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
