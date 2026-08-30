const { findUserById } = require("../repositories/userRepository");

const requireAdmin = async (req, res, next) => {
    try {
        const user = await findUserById(req.auth.userId);
        if (!user || user.role !== "admin") {
            return res.status(403).json({ message: "Administrator access required" });
        }
        req.auth.role = user.role;
        return next();
    } catch (error) {
        return next(error);
    }
};

module.exports = requireAdmin;
