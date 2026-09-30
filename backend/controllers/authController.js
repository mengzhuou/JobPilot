const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const {
    findUserById,
    upsertGoogleUser,
    createPasswordUser, findUserByEmail, recordLogin, updateOnboarding,
} = require("../repositories/userRepository");
const { hashPassword, verifyPassword, validPassword } = require('../services/passwordService');

const googleClient = new OAuth2Client();
const SESSION_COOKIE = "jobpilot_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const publicUser = user => ({
    id: user.id,
    email: user.email,
    name: user.display_name,
    firstName: user.first_name,
    lastName: user.last_name,
    picture: user.picture_url,
    role: user.role,
    onboarding: user.onboarding || null,
});

const cookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
});

const clearCookieOptions = () => {
    const { maxAge, ...options } = cookieOptions();
    return options;
};

const startSession = (res, user, status = 200) => {
    const token = jwt.sign({ userId: user.id }, process.env.SESSION_SECRET,
        { expiresIn: '7d', issuer: 'jobpilot', audience: 'jobpilot-web' });
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    res.set('Cache-Control', 'no-store');
    return res.status(status).json({ user: publicUser(user) });
};
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const register = async (req, res) => {
    const { password, firstName, lastName } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email) || !validPassword(password) || [firstName,lastName].some(name => typeof name !== 'string' || !name.trim() || name.trim().length > 80)) {
        return res.status(400).json({ message: 'Enter your name, a valid email, and a password between 15 and 128 characters.' });
    }
    try {
        const passwordHash = await hashPassword(password);
        const user = await createPasswordUser({ email, firstName:firstName.trim(), lastName:lastName.trim(), passwordHash });
        return startSession(res, user, 201);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Unable to register with these details. If you already have an account, use your existing sign-in method.' });
        return res.status(error.statusCode === 503 ? 503 : 500).json({ message: 'Registration is temporarily unavailable. Please try again.' });
    }
};
const passwordLogin = async (req, res) => {
    const email = normalizeEmail(req.body?.email), password = req.body?.password;
    if (!validEmail(email) || typeof password !== 'string' || !password.length || password.length > 128) {
        return res.status(401).json({ message: 'Invalid email or password.' });
    }
    try {
        const user = await findUserByEmail(email);
        if (!await verifyPassword(password, user?.password_hash)) return res.status(401).json({ message: 'Invalid email or password.' });
        await recordLogin(user.id);
        return startSession(res, user);
    } catch (error) {
        return res.status(error.statusCode === 503 ? 503 : 500).json({ message: 'Sign-in is temporarily unavailable. Please try again.' });
    }
};

const googleLogin = async (req, res, next) => {
    try {
        if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ message: 'Google sign-in is not configured. Use email sign-in.' });
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({ message: "Google credential is required" });
        }

        let ticket;

        try {
            ticket = await googleClient.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
        } catch (error) {
            return res.status(401).json({ message: "Google sign-in failed" });
        }
        const profile = ticket.getPayload();

        if (!profile?.sub || !profile.email || profile.email_verified !== true) {
            return res.status(401).json({ message: "Google account could not be verified" });
        }

        const user = await upsertGoogleUser(profile);
        return startSession(res, user);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Use your existing sign-in method for this account.' });
        return next(error);
    }
};

const getCurrentUser = async (req, res, next) => {
    try {
        const user = await findUserById(req.auth.userId);

        if (!user) {
            res.clearCookie(SESSION_COOKIE, clearCookieOptions());
            return res.status(401).json({ message: "User no longer exists" });
        }

        return res.status(200).json({ user: publicUser(user) });
    } catch (error) {
        return next(error);
    }
};

const logout = (req, res) => {
    res.clearCookie(SESSION_COOKIE, clearCookieOptions());
    return res.status(204).send();
};

module.exports = {
    saveOnboarding: async (req,res,next) => {
        const {status,step}=req.body || {};
        if(!['active','completed','skipped'].includes(status) || !Number.isInteger(step) || step<0 || step>10) {
            return res.status(400).json({message:'Invalid onboarding step.'});
        }
        try {
            const onboarding=await updateOnboarding(req.auth.userId,{status,step});
            if(!onboarding)return res.status(404).json({message:'Account not found.'});
            return res.json({onboarding});
        } catch(error){return next(error);}
    },
    register,
    passwordLogin,
    getCurrentUser,
    googleLogin,
    logout,
};
