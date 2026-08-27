const router = require("express").Router();
const ctrl = require("../controllers/notificationsController");
const { requireAuth } = require("../middleware/auth");

router.get("/", requireAuth, ctrl.getNotifications);

module.exports = router;
