const jwt = require("jsonwebtoken");

const requireAuth = (req, res, next) => {
    const token = req.cookies?.jobpilot_session;

    if (!token) {
        return res.status(401).json({ message: "Authentication required" });
    }

    try {
        const session = jwt.verify(token, process.env.SESSION_SECRET, {
            issuer: "jobpilot",
            audience: "jobpilot-web",
        });

        req.auth = { userId: session.userId };
        return next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired session" });
    }
};

module.exports = requireAuth;
