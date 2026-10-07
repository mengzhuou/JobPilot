# Email/password authentication

`POST /api/auth/register` accepts JSON `{firstName,lastName,email,password}`.
`POST /api/auth/login` accepts JSON `{email,password}`. Both return only the
public user and set a seven-day HttpOnly session cookie: SameSite=None and Secure
in production, SameSite=Lax for local HTTP development. Google sign-in remains separate; matching emails never
implicitly link accounts. Email ownership is not currently verified.

Passwords must be 15–128 characters at registration; they are not trimmed or
silently truncated. Only a versioned scrypt hash is stored in `password_hash`,
including a random 16-byte salt and parameters N=65536, r=8, p=2 (OWASP's 64 MiB
configuration). Verification uses constant-time comparison. Missing and
Google-only accounts perform dummy hashing and receive the same login error.
Passwords/hashes are not included in API responses or application logs.

Abuse controls: 20 requests per IP per 15 minutes across authentication routes,
10 failed email logins per normalized account per 15 minutes, and at most two
concurrent password derivations per server process. JSON-only authentication
requests work with the server's explicit CORS allowlist to prevent cross-origin
form login. Account identifiers in rate-limit keys are hashed.

## Deployment

- Restart the backend to apply migration 021 (or run `npm run db:migrate`).
  Existing Google users are unchanged and have NULL password hashes.
- Set a strong random SESSION_SECRET (at least 32 random bytes), NODE_ENV=production,
  HTTPS, and the exact FRONTEND_ORIGIN. Keep request bodies and credentials out of
  proxy/APM logs. GOOGLE_CLIENT_ID is optional for email-only deployments.
- FRONTEND_ORIGIN must contain the exact frontend origin (comma-separated if
  multiple). Cookie-authenticated mutations and all auth mutations validate
  Origin, falling back to Referer only when Origin is absent. Missing, null and
  untrusted origins are rejected. Scripted session clients must send Origin too.
  This guard runs on cookie-authenticated routes, not globally: extension routes
  validate their revocable Bearer token even when a browser cookie is present.
  Extension requests explicitly omit cookies; Bearer headers cannot bypass the
  origin guard on web profile, pairing, or other cookie-authenticated endpoints.
- Separate onrender.com hosts need the production SameSite=None default. Browser
  third-party-cookie blocking can still prevent login. Prefer HTTPS app/api
  subdomains of your own domain and set SESSION_SAME_SITE=lax for that setup.
  Clear old cookies and sign in again after deploying cookie changes.
- Rate-limit counters are currently process-local. Before deploying multiple
  replicas, configure a shared rate-limit store and the correct trusted proxy
  setting. Do not blindly trust forwarded client IPs.
- Email verification, password recovery, MFA, and breached-password screening
  are not part of this change. Add verified-email recovery before a public launch;
  do not manually assign passwords or automatically merge matching identities.

Reference: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
