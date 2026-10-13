# Tech debt

Known debt in the code: shortcuts, duplication and missing pieces the repository lives with for
now, each with the issue that tracks it. Debt in the checks, in delivery and in the agent harness
is in [`harness-debt.md`](harness-debt.md), in the same form. Bugs and features stay in issues
([`issue-tracker.md`](agents/issue-tracker.md)), and how well each area is tested and documented
is in [`quality.md`](quality.md).

Add a row, with its Size, in the pull request that knowingly leaves debt, and remove it in the one
that pays it off. A row without an issue says "No issue yet"; open one before starting the work.
Older rows start with the `TD-n` id that commits and docs name; a removed id is never reused.

Size is `small` (an hour or two, with no migration, deploy or decision), `medium` (one focused
pull request) or `large` (a plan of its own, or several pull requests). An item that needs a
person's decision is never `small`. The weekly maintenance report counts both files' rows by Size,
and the weekly code gardener takes a small one ([`ci-agents.md`](agents/ci-agents.md), Weekly
maintenance).

## D1 cost

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| TD-15: `GET /api/templates` with no `scope` or `teamId` still returns the public Templates and the user's own, unbounded and uncached, for browser tabs loaded before the scoped client shipped (`functions/api/handlers/template-reads.ts`). | Each such request reads in proportion to the catalog (19k rows at 20k Templates). The scoped client reached Production with #295 at the latest, so the request can now return the public catalog alone, and the branch can go. | No issue yet | small |
| TD-16: Audit rows written before audit compaction still hold up to three full copies of a Run's or Template's content in `before_json`, `after_json` and `diff_json`, which history reads never return. Content has a technical limit (768KB a Template, 896KB a Run, `src/lib/schemas/contentLimits.ts`) derived from the 1MB save body, not a product decision; rows stored before it (Templates imported up to 2MB) can be over it. | The old copies cost storage, and a stored Template or Run over 1MB can't reach its save route at all. The cleanup is a production write the owner approves: null the old copies and compact `diff_json`, confirm the limit as a product limit, and decide row by row about content over it after one read-only query. | No issue yet | large |

## Accounts and email

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| Verification and reset emails go through Resend or useSend (`functions/api/utils/auth-email.ts`), from `noreply@mail.auth.serp.co` unless `EMAIL_FROM` names another sender; Production names `noreply@mail.serplists.com`. SERP's Transactional Email standard sends through Cloudflare Email Sending, from `support@serplists.com`, which also takes the replies, with a dev mailbox for local runs and Staging limited to test recipients. | A reply to a no-reply sender reaches no one, and the standard's local capture and Staging limits are missing. The setup predates the standard; whether to move is the owner's call, and `AGENTS.md` records the departure until then. | No issue yet | medium |
| An account can't be deleted in the product; deletion depends on an email to support, with no documented procedure ([`privacy.md`](product/privacy.md)). | People can't remove their data themselves, and a request by email has no steps to follow. Deleting user data needs the owner. | No issue yet | medium |

## Organizations

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| TD-5: Code identifiers, tables and routes still say `team`, `team_id` and `workspace` for an Organization and the ownership context ([ADR 0001](adr/0001-use-personal-and-organization-ownership-contexts.md); the mapping is in [`CONTEXT.md`](../CONTEXT.md), Legacy names in the code). | A reader meets two names for one thing, and new code can copy the old one. Renaming tables and API routes takes migrations and compatibility for old clients, in separately scoped changes. | No issue yet | large |

## Templates and Runs

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| TD-87: A typed form answer (short or long text, URL, email, number, date) saves only when its field loses focus (`saveRunFormAnswer` in `src/features/run-execution/runExecutionActions.ts`), with no draft and no leave guard; notes keep drafts (`src/features/run-execution/noteDrafts.ts`, `keptNoteDrafts.ts`) and ask before leaving. | Closing the tab, or leaving the page, with the cursor still in a field loses that answer. Keeping answers as drafts like notes, saved with the next queued save or on leaving, with a test that leaves with an answer focused, would keep it. | No issue yet | medium |
| TD-22: Official Templates seeded before the seed fix (the `serp-user` rows in `templates`, their `template_versions` snapshots, Runs started from them, and users' copies) store each text block as one line with a literal backslash-n for each line break, so `expandLegacyEscapedNewlines` still rewrites single-line text blocks on display. | A single-line text block holding a Windows path outside inline code is misread. The fix is a scoped data migration that needs the owner's approval ([Migrating the legacy seed rows](agents/template-content-types.md#migrating-the-legacy-seed-rows-proposal-needs-human-approval)); the shim in `MarkdownBlock` goes once a person decides about users' copies. | No issue yet | medium |
| A Free Personal user's template import or export is refused with "Upgrade this Organization to use template import/export." (`functions/api/handlers/template-backup.ts`), though no Organization is involved. | The message names the wrong context and the wrong upgrade, in a refusal the user is meant to act on. Fixing it changes product wording, which the owner decides. | No issue yet | medium |

## Uploads

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| TD-18: `POST /api/uploads` (`functions/api/handlers/uploads.ts`) limits each file's size per bucket, but keeps no per-account quota and records nothing in D1. | A signed-in account can keep adding 50MB files that nothing references or removes. A quota needs an `uploads` table, a usage row per account and a reservation before each R2 put, and its numbers are a pricing decision. The proposed SQL and Drizzle definitions are in the issue. | Issue to come: upload quota | large |
| TD-19: Template media (`template-images`, `template-videos`, `template-files`) can't be deleted through the API: an upload records neither its Personal or Organization owner nor what references it. | An Organization admin can't remove a file a member uploaded, and cleared or replaced files stay stored and publicly served. It needs TD-18's table, the owner recorded at upload, references kept as Templates and Runs are saved, and a delete that checks the current owner and refuses while a key is referenced. | Issue to come: upload quota | large |
| TD-20: Template uploads are never deleted: clearing or replacing a file in the editor leaves its R2 object, and `DELETE /api/uploads/file` refuses template-bucket keys. | Orphaned files pile up in R2. A scheduled, batched cleanup that deletes a key only once no Template, version snapshot or Run references it (archived and deleted ones included), after a grace period for unsaved editor uploads, would end it. | Issue to come: upload quota | large |

## Run Keys and MCP

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| TD-25: Run Keys never expire, and revoking is the only way to end one. The MCP rate limits live in each isolate's memory, so the only global limit is the per-IP WAF rule `MCP rate limit` ([`security.md`](agents/security.md)), and nothing limits one key globally. Revoked keys are never deleted, so listing a user's keys still scans every revoked one. | A leaked key works until someone revokes it, and one key can pass its limit across isolates. An optional expiry and a per-key limit in shared state (KV, a Durable Object or the Workers rate-limiting binding) would close both. Pruning revoked keys deletes user data, so it needs the owner. | No issue yet | medium |

## Public pages

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| TD-84: `GET /api/profiles/by-username` stays for browser tabs loaded before #232's second pull request; the app resolves `/profile/:handle` through `GET /api/profiles/by-handle`. | One more route to keep tested, rate-limited and within its rows-read budget. After a release cycle, delete the route and `handleProfileByUsername`, their tests (`tests/unit/functions/api/profiles-by-username-d1.test.ts`, and its cases in `profiles-handler.test.ts`), its rate-limit exemption, its rows-read budget and `d1:profile` scenario, and the docs that name it. | No issue yet | small |
| TD-45: The footer's Network column is left out, because its SERP DR link pointed at `https://serp.dr`, which doesn't resolve (`src/components/layout/publicSiteLinks.ts`). | The footer lacks the network's links. Once the owner confirms the address, the column comes back as an external https link, with its domain added to the allowlist in `tests/unit/components/publicSiteLinks.test.ts`. | No issue yet | medium |

## Privacy

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| serplists.com has no privacy policy page; what the product collects is written only in [`privacy.md`](product/privacy.md). | People can't read what is collected about them. The policy is legal copy the owner approves. | No issue yet | medium |
| Production loads Google Analytics 4 through Tag Manager, which sets `_ga` cookies, with no consent banner and no opt-out in the product ([`privacy.md`](product/privacy.md#analytics)). | Consent rules may apply to visitors from some regions; whether to ask, and how, is the owner's decision. | No issue yet | medium |
| Audit rows keep `ip_hash`, an unsalted SHA-256 of the client's IP address (`functions/api/utils/audit.ts`). | Hashing every IPv4 address recovers the address, so the hash hides little. A keyed hash fixes new rows; the rows already written keep theirs unless the owner decides to clear them. | No issue yet | medium |
| Template video blocks embed YouTube from `www.youtube.com`, not `www.youtube-nocookie.com` (`src/utils/urlHelpers.ts`, `src/components/shared/VideoEmbed.tsx`). | YouTube can set its cookies as soon as the player loads, before anyone presses play ([`privacy.md`](product/privacy.md#videos-and-media-in-templates)). | No issue yet | small |
| The sidebar writes a `sidebar_state` cookie that nothing reads (`src/components/ui/sidebar-provider.tsx`). | The browser sends it with every request for nothing ([`privacy.md`](product/privacy.md#cookies-and-browser-storage)). | No issue yet | small |
| Workers Logs' invocation logs are on (`[observability] enabled = true` in `wrangler.toml`, with no `invocation_logs = false`): Cloudflare keeps each request's full URL and location, and possibly its headers with the visitor's IP address, for 3 to 7 days, and its docs list no fields ([`privacy.md`](product/privacy.md#server-logs)). | The privacy doc has to hedge about an IP address the API itself never logs. Turning them off loses the dashboard's per-request records, so it is the owner's call; reading one Staging invocation log would make the doc exact. | No issue yet | medium |

## Database

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| TD-14: Drizzle has no snapshots of the migrations so far, so `pnpm run db:generate` proposes a fresh baseline migration, which must not be applied or committed ([`database-operations.md`](agents/database-operations.md)). | Drizzle Kit can't generate the next migration from a schema change, so each one is written by hand. Initializing the snapshots is a change of its own, following the database playbook. | No issue yet | medium |
