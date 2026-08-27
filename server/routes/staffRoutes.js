const router = require("express").Router();
const ctrl = require("../controllers/staffController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("owner", "staff"));

router.get("/", ctrl.getStaff);
router.get("/riders", ctrl.getRiders);
router.post("/", requireRole("owner"), ctrl.createStaff);
router.delete("/:id", requireRole("owner"), ctrl.deleteStaff);
router.patch("/:id/status", ctrl.updateStatus);
router.patch("/:id/shift", requireRole("owner"), ctrl.updateShift);

router.get("/tasks", ctrl.getTasks);
router.post("/tasks", ctrl.createTask);
router.patch("/tasks/:id", ctrl.updateTask);
router.delete("/tasks/:id", ctrl.deleteTask);

module.exports = router;
