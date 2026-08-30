const express = require("express");
const {
    getCurrentUser,
    googleLogin,
    logout,
} = require("../controllers/authController");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.post("/google", googleLogin);
router.get("/me", requireAuth, getCurrentUser);
router.post("/logout", logout);

module.exports = router;
