const router = require("express").Router();
const requireAuth = require("../middleware/requireAuth");
const controller = require("../controllers/jobPreferenceController");
router.use(requireAuth);
router.get("/", controller.list);
router.post("/", controller.create);
router.delete("/:id", controller.remove);
module.exports = router;
