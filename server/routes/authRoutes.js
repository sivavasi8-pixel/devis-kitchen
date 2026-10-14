const router = require("express").Router();
const ctrl = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

router.post("/login", ctrl.login);
router.post("/signup", ctrl.signup);
router.get("/me", requireAuth, ctrl.me);
router.patch("/me", requireAuth, ctrl.updateProfile);
router.post("/change-password", requireAuth, ctrl.changePassword);
router.post("/change-pin", requireAuth, ctrl.changePin);
router.post("/reset-password", ctrl.resetPassword);
router.post("/request-pin-reset", ctrl.requestPinReset);

module.exports = router;
