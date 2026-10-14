const express = require("express");
const router = express.Router();
const inventoryController = require("../controllers/inventoryController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("owner", "staff"));

router.get("/", inventoryController.getInventory);
router.get("/:id/movements", inventoryController.getMovements);
router.get("/:id", inventoryController.getItem);
// Restocking (quantity) is an owner+staff operational action; adding/removing an
// ingredient from the catalog entirely is an owner-only decision.
router.patch("/:id", inventoryController.updateItem);
router.post("/", requireRole("owner"), inventoryController.createItem);
router.delete("/:id", requireRole("owner"), inventoryController.deleteItem);

module.exports = router;
