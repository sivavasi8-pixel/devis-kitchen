const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const { requireAuth, requireRole } = require("../middleware/auth");

// All customer-management routes require an active owner or staff session.
router.use(requireAuth, requireRole("owner", "staff"));

router.get("/", customerController.listCustomers);
router.post("/:id/reset-pin", customerController.adminResetPin);
router.post("/:id/reset-password", customerController.adminResetPassword);

module.exports = router;
