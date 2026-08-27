const router = require("express").Router();
const ctrl = require("../controllers/reportsController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/summary", requireAuth, requireRole("owner"), ctrl.getSummary);

module.exports = router;
