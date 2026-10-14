const express = require("express");
const router = express.Router();
const addressController = require("../controllers/addressController");
const { requireAuth, requireRole } = require("../middleware/auth");

// A customer's own address book — owner/staff never need this (they use the
// address typed on the order itself, e.g. a phone/POS order on someone's behalf).
router.use(requireAuth, requireRole("customer"));

router.get("/", addressController.listMyAddresses);
router.post("/", addressController.createAddress);
router.patch("/:id", addressController.updateAddress);
router.patch("/:id/default", addressController.setDefaultAddress);
router.delete("/:id", addressController.deleteAddress);

module.exports = router;
