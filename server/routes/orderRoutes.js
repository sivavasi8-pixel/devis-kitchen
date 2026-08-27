const router = require("express").Router();
const ctrl = require("../controllers/orderController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth);

router.get("/", requireRole("owner", "staff"), ctrl.getOrders);
router.get("/mine", requireRole("customer"), ctrl.getMyOrders);
router.get("/deliveries/mine", requireRole("rider"), ctrl.getMyDeliveries);
router.get("/deliveries/unassigned", requireRole("owner", "staff", "rider"), ctrl.getUnassigned);
router.get("/:id", ctrl.getOrder); // any role; ownership enforced in controller
router.post("/", requireRole("owner", "staff", "customer"), ctrl.createOrder);
router.patch("/:id/status", requireRole("owner", "staff", "rider"), ctrl.updateOrderStatus);
router.patch("/:id/assign-rider", requireRole("owner", "staff", "rider"), ctrl.assignRider);
router.patch("/:id/payment", requireRole("owner", "staff"), ctrl.updateOrderPayment);
router.patch("/:id/cancel", ctrl.cancelOrder); // any role; ownership/state enforced in controller

module.exports = router;
