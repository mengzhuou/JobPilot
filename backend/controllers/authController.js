const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const {
    findUserById,
    upsertGoogleUser,
} = require("../repositories/userRepository");

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

const googleLogin = async (req, res, next) => {
    try {
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
        const sessionToken = jwt.sign(
            { userId: user.id },
            process.env.SESSION_SECRET,
            {
                expiresIn: "7d",
                issuer: "jobpilot",
                audience: "jobpilot-web",
            }
        );

        res.cookie(SESSION_COOKIE, sessionToken, cookieOptions());
        return res.status(200).json({ user: publicUser(user) });
    } catch (error) {
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
    getCurrentUser,
    googleLogin,
    logout,
};
