const router = require("express").Router();
const requireAuth = require("../middleware/requireAuth");
const controller = require("../controllers/userProfileController");

router.use(requireAuth);
router.get('/locations', (req, res, next) => {
    if (Object.values(req.query).some(value => typeof value !== 'string' || value.length > 199)) return res.status(400).json({ message: 'Invalid location search' });
    try { res.json({ options: require('../services/profileLocations').locationOptions(req.query) }); }
    catch (error) { next(error); }
});
router.get("/", controller.get);
router.patch("/", controller.update);

module.exports = router;
