const router = require("express").Router();
const ctrl = require("../controllers/pushController");
const { requireAuth } = require("../middleware/auth");

// Any logged-in role can opt a device in/out — owner, staff, rider, and
// customer all get pushes relevant to them (see server/services/push.js).
router.post("/register", requireAuth, ctrl.register);
router.post("/unregister", requireAuth, ctrl.unregister);

module.exports = router;
