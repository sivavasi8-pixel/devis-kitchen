const router = require("express").Router();
const ctrl = require("../controllers/subscriptionController");
const { requireAuth, requireRole } = require("../middleware/auth");

// Browsing is public — same rule GET /api/menu already follows for the
// regular Order page: anyone can see what's on offer without logging in,
// login is only required to actually commit to something. Deliberately no
// blanket requireAuth on this router; each route below opts in for itself.

// Plans — browse (public) vs manage (owner only)
router.get("/plans", ctrl.getActivePlans);
router.get("/plans/all", requireAuth, requireRole("owner"), ctrl.getAllPlans);
router.post("/plans", requireAuth, requireRole("owner"), ctrl.createPlan);
router.patch("/plans/:id", requireAuth, requireRole("owner"), ctrl.updatePlan);
router.delete("/plans/:id", requireAuth, requireRole("owner"), ctrl.deletePlan);

// Settings — discount tiers + delivery fee (public read, so the live
// calculator can show real numbers before anyone logs in; owner-only write)
router.get("/settings", ctrl.getSettings);
router.patch("/settings/discount", requireAuth, requireRole("owner"), ctrl.updateDiscount);
router.patch("/settings/delivery-fee", requireAuth, requireRole("owner"), ctrl.updateDeliveryFee);

// Eligible items + pricing preview — public, same reasoning as the menu
router.get("/eligible-items", ctrl.getEligibleItems);
router.post("/quote", ctrl.getQuote);

// Everything past this point is an actual account action
router.post("/", requireAuth, requireRole("customer"), ctrl.createSubscription);
router.get("/mine", requireAuth, requireRole("customer"), ctrl.getMySubscriptions);
router.get("/", requireAuth, requireRole("owner", "staff"), ctrl.getAllSubscriptions);
router.patch("/:id/status", requireAuth, ctrl.updateSubscriptionStatus); // ownership checked in the controller

module.exports = router;
