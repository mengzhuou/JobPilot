const express = require("express");
const {
    getCurrentUser,
    googleLogin,
    logout,
    register, passwordLogin, saveOnboarding,
} = require("../controllers/authController");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
const { rateLimit } = require('express-rate-limit');
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
    message: { message: 'Too many sign-in attempts. Please try again in 15 minutes.' } });
const { createHash } = require('crypto');
const accountLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
    standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => createHash('sha256').update(typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '').digest('hex'),
    message: { message: 'Too many sign-in attempts. Please try again in 15 minutes.' } });
const jsonOnly = (req,res,next) => req.is('application/json') ? next() : res.status(415).json({message:'Send application/json.'});
router.post('/register', authLimit, jsonOnly, register);
router.post('/login', authLimit, jsonOnly, accountLimit, passwordLogin);

router.post("/google", authLimit, jsonOnly, googleLogin);
router.get("/me", requireAuth, getCurrentUser);
router.patch('/onboarding', requireAuth, jsonOnly, saveOnboarding);
router.post("/logout", logout);

module.exports = router;
