const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");
const { requireAuth, requireRole } = require("../middleware/auth");

// Public — the checkout page needs the UPI VPA before a customer necessarily
// has an account, same as /api/orders/store-status.
router.get("/", settingsController.getPublicSettings);
router.patch("/", requireAuth, requireRole("owner"), settingsController.updateSettings);

module.exports = router;
