const router = require("express").Router();
const ctrl = require("../controllers/dashboardController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/summary", requireAuth, requireRole("owner", "staff"), ctrl.getSummary);

module.exports = router;
