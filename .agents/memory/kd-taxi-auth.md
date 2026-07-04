---
name: KD TAXI auth model
description: How login/role identification and API authorization work in the KD TAXI app (artifacts/kd-taxi + artifacts/api-server).
---

Login identifies the account (and therefore its role — client/driver/admin) purely from `phone + password`. There is intentionally no client-selectable mode/role picker anywhere in the UI.

**Why:** Originally the login screen let the user pick "Cliente"/"Motorista"/"Admin" themselves with little to no password check, meaning anyone could self-assign any role or spoof another phone number's identity. Role must be intrinsic to the authenticated account, decided once at registration (`mode: "client"|"driver"` only — admin accounts are never self-registrable) and returned by the server on login.

**How to apply:**
- Passwords are bcrypt-hashed (`passwordHash` field, never `password`), required for every account type including client/driver (previously client/driver had no password at all).
- Auth is bearer-token session based (`Authorization: Bearer <token>`, in-memory `sessions` map with TTL, no JWT/DB persistence — matches the app's in-memory data store). All non-auth routes require `requireAuth` or `requireAdmin` middleware; route handlers additionally verify the acting user ID matches the resource being mutated (e.g. `clientId` in `/request-ride` must equal `req.authUser.id`).
- Login/register endpoints are rate-limited (`express-rate-limit`) to blunt brute-force attempts.
- If extending this app, keep new mutating routes behind `requireAuth`/`requireAdmin` and re-verify actor identity server-side — do not trust IDs sent in the request body alone.
