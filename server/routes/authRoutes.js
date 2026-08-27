const router = require("express").Router();
const ctrl = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

router.post("/login", ctrl.login);
router.post("/signup", ctrl.signup);
router.get("/me", requireAuth, ctrl.me);

module.exports = router;
