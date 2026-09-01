const router = require("express").Router();
const requireAuth = require("../middleware/requireAuth");
const requireAdmin = require("../middleware/requireAdmin");
const controller = require("../controllers/jobAnalyticsController");

router.use(requireAuth, requireAdmin);
router.get("/market", controller.getSnapshot);
router.post("/market/refresh", controller.refreshSnapshot);

module.exports = router;
