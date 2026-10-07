// Cross-site Render hosts require None + Secure. Same-site deployments may
// explicitly opt into Lax; local HTTP development must remain Lax.
module.exports = (env = process.env) => ({
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' && env.SESSION_SAME_SITE !== 'lax' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
});
