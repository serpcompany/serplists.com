# Error contract

How the API reports errors, by status and `code`, and what the app does with each.

Abbreviations: **Access flow tests** is `tests/unit/lib/access-flow.test.ts`,
**Session failure tests** is `tests/unit/functions/api/router-session-failure.test.ts`,
**API error tests** is `tests/unit/lib/api-errors.test.ts`,
**Limit message tests** is `tests/unit/functions/api/limit-messages.test.ts`,
**Organization copy API tests** is `tests/unit/functions/api/templates-clone-organization.test.ts`,
**Billing API tests** is `tests/unit/functions/api/billing-handler.test.ts`,
**Auth error tests** is `tests/unit/functions/api/router-auth-errors.test.ts`,
**Auth messages spec** is `tests/e2e/auth-error-messages.spec.ts`,
**Template update tests** is `tests/unit/functions/api/templates-handler.update.test.ts`,
**Run update tests** is `tests/unit/functions/api/checklists-handler.update.test.ts`,
**Edit conflict tests** is `tests/unit/lib/editConflicts.test.ts`,
**Kept work spec** is `tests/e2e/session-end-kept-work.spec.ts`, and
**Content limit tests** is `tests/unit/functions/api/content-size-limits.test.ts`.

## Signing in

**`401 Unauthorized`.** The user must sign in.

- Check: Session failure tests, "still answers 401 when there is no session, which Better Auth
  reports as null".

The app sends them to sign in with the page they were on, its query and its hash, as the way
back.

- Check: Access flow tests, "goes to sign-in while the user is still on the page, with the page,
  its query and its hash as the way back".

**A failed session lookup.** A session lookup that fails answers `500`, not `401`, so a signed-in
user is never asked to sign in again because of it, and the app keeps the error retryable.

- Check: Session failure tests, "answers %s /api/%s with 500, not 401, and logs the failure".

## Plans and roles

**`403 upgrade_required`.** The active Personal or Organization context needs a paid entitlement.

- Check: Limit message tests, "asks for Pro instead of reporting a template limit, since copying
  into Personal needs Pro whatever the count".

**`403 limit_reached`.** The active Personal or Organization context hit a plan limit
([Pricing and Entitlements](pricing-and-entitlements.md)).

- Check: Limit message tests, "limit_reached names the context whose limit was hit, and offers Pro
  only for a Personal one, since Personal Pro never lifts an Organization limit".

**`403 Forbidden`.** The user is signed in but lacks the required role or permission. The answer
carries no `code`, so it never reads as an upgrade.

- Check: Organization copy API tests, "refuses a role that cannot add Templates to the
  Organization".

**`503 billing_unavailable`.** A paid action cannot be started because billing config is
unavailable ([Billing and checkout](billing-and-checkout.md)).

- Check: Billing API tests, "POST /api/billing/checkout returns 503 when Stripe is not
  configured".

## Auth routes

**`503 auth_email_unavailable`.** Auth email delivery is unavailable for flows that require
outbound email.

- Check: Auth error tests, "sends a readable 503 when auth email cannot be sent".

**`429 rate_limited`.** Too many attempts from this network; the body's `retryAfterSeconds` and
the `Retry-After` header say how long to wait. Auth errors also carry `message`, which the Better
Auth client reads.

- Check: Auth error tests, "sends a readable 429 with the wait in the body and an exposed
  Retry-After".

The sign-in page tells the user to wait.

- Check: Auth messages spec, "a rate-limited sign-in tells the user to wait".

## Saves

**`409 edit_conflict`.** A Template changed after the editor loaded it; load the latest version
before retrying.

- Check: Template update tests, "rejects a stale template editor version before writing" and
  "reports a conflict when a template changes between the read and conditional write".

A run answers the same way.

- Check: Run update tests, "reports a conflict when a run changes between the read and conditional
  write".

The runs list and the template page refresh by themselves (`src/lib/editConflicts.ts`).

- Check: Edit conflict tests, "matches answers that mean the cached copy is out of date", "says
  the run list was refreshed instead of asking for the refresh that already happened" and "says
  the template was reloaded".

The template editor offers Load latest version.

- Check: Kept work spec, "restored edits to a template saved elsewhere meanwhile get the edit
  conflict instead of overwriting it".

**`400` on a Template payload.** On a template create or update, the message starts with the
failing field (for example `seoDescription: ...`) and `details.field` names it.

- Check: Template update tests, "names the invalid field in template payload errors, after reading
  the stored row since bounds apply to changed fields only".

**`413 content_too_large`.** The Template or run content would be larger than a save can send
back (`details.limit` in bytes, see `src/lib/schemas/contentLimits.ts`): 768KB for a Template and
896KB for a run, counting what the app adds to every task. It covers creating, saving and copying
a Template, starting a run, and saving or revalidating a run.

- Check: Content limit tests, "creates a template at the limit and refuses one over it", "refuses a
  save that grows the content past the limit", "refuses to copy a public template stored over the
  limit", "refuses to start a run from a template too large for the run to be saved", "refuses a
  save whose notes take the run past the limit" and "refuses a revalidate that would take the run
  past the limit".

A save that does not grow content already over the limit still goes through, so it can be
trimmed.

- Check: Content limit tests, "saves a template stored over the limit before it existed, when the
  save does not grow it" and "saves an untick on a run at the limit, so a run whose notes reached
  it still records progress both ways".

A Template change skips a run it would grow past the limit, and that run stays stale.

- Check: Content limit tests, "leaves out of reconciliation a run the change would take past the
  run limit, which goes stale while the save and other runs go through".

## In the app

**Structured errors.** The client preserves API `status`, `code`, and `details` so UI behavior
does not depend on string matching generic error messages.

- Check: API error tests, "preserves structured API fields".
