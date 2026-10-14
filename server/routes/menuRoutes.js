const router = require("express").Router();
const multer = require("multer");
const ctrl = require("../controllers/menuController");
const { requireAuth, requireRole } = require("../middleware/auth");

// Only real photo formats — anything else (HTML, SVG, scripts) is rejected, since these
// files are served back to every visitor from our own domain.
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error("Photos must be JPEG, PNG, WebP or GIF"), { status: 400 }));
  }
});

router.get("/", ctrl.getMenu); // public — browsing the menu needs no login
router.get("/:id/image", ctrl.getImage); // public
router.get("/:id", ctrl.getItem); // public — registered after /:id/image so it doesn't shadow it
router.get("/:id/images/:imageId", ctrl.getGalleryImage); // public
router.post("/", requireAuth, requireRole("owner"), upload.single("image"), ctrl.createMenuItem);
router.patch("/:id", requireAuth, requireRole("owner"), upload.single("image"), ctrl.updateMenuItem);
router.delete("/:id", requireAuth, requireRole("owner"), ctrl.deleteMenuItem);
router.patch("/:id/availability", requireAuth, requireRole("owner", "staff"), ctrl.setAvailability);
router.patch("/:id/special", requireAuth, requireRole("owner", "staff"), ctrl.setSpecial);
router.patch("/:id/popular", requireAuth, requireRole("owner", "staff"), ctrl.setPopular);
router.get("/:id/recipe", requireAuth, requireRole("owner"), ctrl.getRecipe);
router.put("/:id/recipe", requireAuth, requireRole("owner"), ctrl.setRecipe);
router.post("/:id/images", requireAuth, requireRole("owner"), upload.single("image"), ctrl.addGalleryImage);
router.delete("/:id/images/:imageId", requireAuth, requireRole("owner"), ctrl.deleteGalleryImage);

module.exports = router;
