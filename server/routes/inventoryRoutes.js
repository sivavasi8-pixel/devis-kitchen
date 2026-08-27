const router = require("express").Router();
const ctrl = require("../controllers/inventoryController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("owner", "staff"));

router.get("/", ctrl.getInventory);
router.post("/", requireRole("owner"), ctrl.createItem);
router.patch("/:id", ctrl.updateItem); // quantity-only PATCH allowed for staff too
router.delete("/:id", requireRole("owner"), ctrl.deleteItem);

module.exports = router;
