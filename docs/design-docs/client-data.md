# Client data

How the app's screens call the API and what a failed call means. The rules every screen
follows (query keys per user and context, list states, feedback after a write) are in
[FRONTEND.md](../FRONTEND.md#data-and-state); the API's base URL and server-side caching are
in [data persistence](data-persistence.md#api-access).

## The API client

`api` (`src/lib/api.ts`) joins the endpoint groups in `src/lib/api/` (templates, runs, teams,
account) into one object. Each call goes through `apiRequest`, or `apiFormDataRequest` for an
upload (`src/lib/api/request.ts`), which sends the Better Auth session cookie
(`credentials: 'include'`) and turns every answer that is not `2xx` into an `ApiError`. A `401`
is also reported to `src/lib/unauthorizedResponses.ts`, which re-checks the session
([authentication](authentication.md#contract)).

A successful body is returned as the declared type without parsing (TD-2 in the
[tech debt tracker](../exec-plans/tech-debt-tracker.md)). The calls that do parse their answer
with Zod are the MCP connection (`src/lib/schemas/agentMcpConnection.ts`), created and
previewed invites (`src/lib/schemas/teamInvite.ts`) and a template save
(`parseTemplateUpdateResponse` in `src/lib/templateUpdateResult.ts`).

History requests ask for what their screen shows, since each entry is an audit row read with
its user: the run and Template Changelogs ask for `HISTORY_DISPLAY_LIMIT` entries
(`src/lib/history.ts`), never the API's default of 50, and Organization activity asks for the
10 its settings page shows.

## Error types

An `ApiError` (`src/lib/api-errors.ts`) carries the HTTP `status` and the body's `code` and
`details`; its message is the body's `error`, or `HTTP <status>` when the body has none. Pages
decide by status and code, never by message text:

| Predicate | Answer | Meaning |
| --- | --- | --- |
| `isNotFoundError` | `404` | Settled: the resource is missing, deleted, or private to someone else. Anything else (a network failure, a `5xx`, a `429`) may pass, so the page offers a retry, never "not found". |
| `isAuthRequiredError` | `401` | No valid session: sign in and come back to the page. |
| `isUpgradeRequiredError` | `403 upgrade_required`, or `403 limit_reached` for a Personal limit | A plan gate that Personal checkout can lift. `details.context` names whose limit was reached. A Personal Pro plan never lifts an Organization's limit, so an Organization limit is a plain error with the server's message, and an answer without a context (from an API older than contexts) counts as Personal. |
| `isEditConflictError` | `409 edit_conflict` | The template or run changed after the page loaded it. |
| `isBillingUnavailableError` | `billing_unavailable` | Checkout cannot start. |
| `isSubscriptionNeedsAttentionError`, `isOpenSubscriptionConflictError`, `isBillingCustomerMissingError` | `409` from checkout or the Customer Portal | The stored plan or Stripe account differs from what the page shows ([billing](billing.md#app-endpoints)). |

`getAccessFailure` reduces an error to the kind a page acts on: `auth_required`,
`upgrade_required`, `billing_unavailable`, `subscription_needs_attention`, or a plain `error`
with the server's message or the page's fallback. `handleAccessFailure`
(`src/lib/access-flow.ts`) then signs in, starts checkout or shows the message.
