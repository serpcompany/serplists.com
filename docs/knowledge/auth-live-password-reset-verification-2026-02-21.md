# Live password reset verification (2026-02-21)

## Context
- User reported that password reset on `https://serplists.com` did not work.
- Verification was run against production APIs and real inbound email capture through `https://2faslingshot.com/api/messages` (otp relay), as requested.

## What was verified
1. `POST /api/auth/request-password-reset` on `https://serplists.com` returns `200` for reset requests.
2. A reset email was observed in otp relay:
   - recipient: `otp@2faslingshot.com`
   - sender: `noreply@mail.auth.serp.co`
   - subject: `Reset your password`
3. Reset email link opened successfully:
   - `GET /api/auth/reset-password/:token?callbackURL=...` returned `302`
   - redirect target contained `?token=...` for `/reset-password`
4. Password update succeeded:
   - `POST /api/auth/reset-password` returned `200 {"status":true}`
5. New password validity was confirmed:
   - `POST /api/auth/sign-in/email` with the new password returned `403 EMAIL_NOT_VERIFIED` (expected for unverified accounts, indicates password was accepted).

## Additional findings
- `www.serplists.com` currently returns `522` from Cloudflare.
- The otp relay appears configured for `otp@2faslingshot.com` routing; unique local-part addresses (for example `foo@2faslingshot.com`) were not observed in relay output during this run.

## Conclusion
- The live password reset pipeline on `serplists.com` is operational end-to-end at the API/email/token/reset layers.
- If a user still cannot reset, most likely causes are:
  - wrong/non-existent account email entered,
  - mailbox delivery/spam filtering,
  - stale/expired reset link,
  - using the non-working `www` hostname.
