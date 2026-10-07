// Protect cookie-authenticated mutations, including login/logout, independently
// of CORS. Token-authenticated extension endpoints remain protected by their
// own middleware and never use ambient browser session credentials.
module.exports = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const cookieSession = Boolean(req.cookies?.jobpilot_session);
    const sessionEndpoint = /^\/api\/auth(?:\/|$)/.test(req.originalUrl);
    if (!cookieSession && !sessionEndpoint) return next();
    const allowed = String(process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
        .split(',').map(value => value.trim()).filter(Boolean);
    const origin = req.get('Origin');
    let source = origin;
    if (!source) {
        try { source = new URL(req.get('Referer')).origin; } catch { /* Fail closed. */ }
    }
    if (!source || source === 'null' || !allowed.includes(source)) {
        return res.status(403).json({ message: 'Untrusted request origin. Reopen JobPilot and try again.' });
    }
    return next();
};
