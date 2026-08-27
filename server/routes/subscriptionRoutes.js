const router = require("express").Router();
const ctrl = require("../controllers/subscriptionController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth);

// Plans — browse (any role) vs manage (owner only)
router.get("/plans", ctrl.getActivePlans);
router.get("/plans/all", requireRole("owner"), ctrl.getAllPlans);
router.post("/plans", requireRole("owner"), ctrl.createPlan);
router.patch("/plans/:id", requireRole("owner"), ctrl.updatePlan);
router.delete("/plans/:id", requireRole("owner"), ctrl.deletePlan);

// Settings — discount tiers + delivery fee
router.get("/settings", ctrl.getSettings);
router.patch("/settings/discount", requireRole("owner"), ctrl.updateDiscount);
router.patch("/settings/delivery-fee", requireRole("owner"), ctrl.updateDeliveryFee);

// Eligible items, for building a selection
router.get("/eligible-items", ctrl.getEligibleItems);

// Pricing preview (nothing saved) and the real subscribe action
router.post("/quote", ctrl.getQuote);
router.post("/", requireRole("customer"), ctrl.createSubscription);

// Viewing and managing subscriptions
router.get("/mine", requireRole("customer"), ctrl.getMySubscriptions);
router.get("/", requireRole("owner", "staff"), ctrl.getAllSubscriptions);
router.patch("/:id/status", ctrl.updateSubscriptionStatus);

module.exports = router;
