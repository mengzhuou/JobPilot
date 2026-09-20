const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const controller = require("../controllers/extensionController");
const requireAuth = require("../middleware/requireAuth");
const requireExtensionAuth = require("../middleware/requireExtensionAuth");

const pairingLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many extension connection attempts. Please wait and try again." },
});
const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Please wait before requesting another AI answer plan." },
});

// Website endpoints use the normal signed-in browser session.
router.post("/pair", requireAuth, pairingLimiter, controller.pairingCode);
router.get("/connections", requireAuth, controller.listConnections);
router.delete("/connections/:id", requireAuth, controller.revokeConnection);

// The exchange is deliberately unauthenticated and protected by a short-lived,
// one-use code plus rate limiting.
router.post("/exchange", pairingLimiter, controller.exchange);

// Extension endpoints require a scoped, revocable extension token.
router.use(requireExtensionAuth);
router.delete("/connection", controller.disconnect);
router.get("/autofill-profile", controller.getMappedProfile);
router.get("/primary-resume", controller.primaryResume);
router.post("/fill-plan", controller.fillPlan);
router.post("/ai-plan", aiLimiter, controller.aiPlan);
router.post("/answer-memory", controller.saveAnswerMemory);

module.exports = router;
