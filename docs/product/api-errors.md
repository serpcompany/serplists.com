# Error contract

- `401 Unauthorized`: the user must sign in.
- `403 upgrade_required`: the active Personal or Organization context needs a paid entitlement.
- `403 limit_reached`: the active Personal or Organization context hit a plan limit.
- `403 Forbidden`: the user is signed in but lacks the required role or permission.
- `503 billing_unavailable`: paid action cannot be started because billing config is unavailable.
- `503 auth_email_unavailable`: auth email delivery is unavailable for flows that require outbound email.
- `409 edit_conflict`: a template or run changed after the editor loaded it; load the latest version before retrying (the runs list and the template page refresh by themselves, see `src/lib/editConflicts.ts`; the template editor offers Load latest version).
- `400` on a template create or update payload: the message starts with the failing field (for example `seoDescription: ...`) and `details.field` names it.
- `413 content_too_large`: the Template or run content would be larger than a save can send back (`details.limit` in bytes, see `src/lib/schemas/contentLimits.ts`): 768KB for a Template and 896KB for a run, counting what the app adds to every task. It covers creating, saving and copying a Template, starting a run, and saving or revalidating a run. A save that does not grow content already over the limit still goes through, so it can be trimmed. A Template change skips a run it would grow past the limit, and that run stays stale.
- `429 rate_limited` (auth routes): too many attempts from this network; the body's
  `retryAfterSeconds` and the `Retry-After` header say how long to wait. Auth errors
  also carry `message`, which the Better Auth client reads.

The client preserves API `status`, `code`, and `details` so UI behavior does not depend on string matching generic error messages.
