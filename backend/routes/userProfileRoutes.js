const router = require("express").Router();
const requireAuth = require("../middleware/requireAuth");
const controller = require("../controllers/userProfileController");

router.use(requireAuth);
router.get("/", controller.get);
router.patch("/", controller.update);

module.exports = router;
