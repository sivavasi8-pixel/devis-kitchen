const router = require("express").Router();
const ctrl = require("../controllers/expensesController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("owner"));

router.get("/", ctrl.getExpenses);
router.post("/", ctrl.createExpense);
router.delete("/:id", ctrl.deleteExpense);

module.exports = router;
