const express = require("express");
const router = express.Router();
const geocodeController = require("../controllers/geocodeController");
const { requireAuth } = require("../middleware/auth");

// Any logged-in role — an owner (Settings) and a customer (address book) both
// use the same two lookups.
router.use(requireAuth);

router.post("/reverse", geocodeController.reverse);
router.post("/resolve-link", geocodeController.resolveLink);

module.exports = router;
