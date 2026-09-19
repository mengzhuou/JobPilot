const repository = require("../repositories/extensionConnectionRepository");

const requireExtensionAuth = async (req, res, next) => {
    try {
        const authorization = String(req.headers.authorization || "");
        const match = authorization.match(/^Bearer\s+(.+)$/i);
        if (!match) return res.status(401).json({ message: "Extension connection required" });

        const connection = await repository.findActiveToken(match[1]);
        if (!connection) return res.status(401).json({ message: "Extension connection is invalid or expired" });

        req.auth = {
            userId: connection.user_id,
            extensionTokenId: connection.id,
        };
        return next();
    } catch (error) {
        return next(error);
    }
};

module.exports = requireExtensionAuth;

