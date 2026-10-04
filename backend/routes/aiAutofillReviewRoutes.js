const router = require("express").Router();
const requireAuth = require("../middleware/requireAuth");
const controller = require("../controllers/aiAutofillReviewController");

router.use(requireAuth, require('../middleware/requireAdmin'));
router.get("/reviews", controller.listWaitingForReview);
router.get("/reviews/:id", controller.getReview);

module.exports = router;
