const router = require("express").Router();
const multer = require("multer");
const ctrl = require("../controllers/orderController");
const { requireAuth, requireRole } = require("../middleware/auth");

// Receipt photos live in Postgres (bytea), not on disk — memoryStorage keeps
// the upload as a Buffer only. Same allowlist/size cap as menu photos
// (routes/menuRoutes.js): real photo formats only, since these are served
// back from our own domain.
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error("Receipt must be a JPEG, PNG, WebP or GIF image"), { status: 400 }));
  }
});

// Public: opening hours, bookable slots and delivery zones for the checkout page.
router.get("/store-status", ctrl.getStoreStatus);

router.use(requireAuth);

router.get("/", requireRole("owner", "staff"), ctrl.getOrders);
router.get("/mine", requireRole("customer"), ctrl.getMyOrders);
router.get("/deliveries/mine", requireRole("rider"), ctrl.getMyDeliveries);
router.get("/deliveries/unassigned", requireRole("owner", "staff", "rider"), ctrl.getUnassigned);
router.post("/quote", requireRole("customer"), ctrl.quoteOrder);
router.get("/:id", ctrl.getOrder); // any role; ownership enforced in controller
router.post("/", requireRole("owner", "staff", "customer"), ctrl.createOrder);
router.patch("/:id/status", requireRole("owner", "staff", "rider"), ctrl.updateOrderStatus);
router.patch("/:id/assign-rider", requireRole("owner", "staff", "rider"), ctrl.assignRider);
router.patch("/:id/release", requireRole("rider"), ctrl.releaseOrder);
router.patch("/:id/payment", requireRole("owner", "staff"), ctrl.updateOrderPayment);
router.patch("/:id/priority", requireRole("owner", "staff"), ctrl.updateOrderPriority);

// A customer uploads proof of payment for their own order; owner/staff review
// it (same lookup, broader role) before marking paid.
router.post("/:id/receipt", requireRole("owner", "staff", "customer"), upload.single("receipt"), ctrl.uploadReceipt);
router.get("/:id/receipt", requireRole("owner", "staff", "customer"), ctrl.getReceipt);

router.patch("/:id/cancel", requireRole("owner", "staff", "customer"), ctrl.cancelOrder); // ownership/state enforced in controller

module.exports = router;
