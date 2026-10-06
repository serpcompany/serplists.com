# Plans

Plans are versioned with the code so the next agent run can pick up where the last
one stopped without chat history.

- **Small changes** (one PR, obvious approach): no plan file; the PR description is enough.
- **Multi-step work** (several PRs, open design questions, or work that spans
  sessions): create `active/<short-name>.md` from the template below and keep it
  current as you go.
- **Finished work**: set the status to completed and move the file to `completed/`.
  Do not delete plans; their decision logs explain why the code looks the way it does.
  Keep the `.gitkeep` in both folders so they exist in a fresh checkout when empty;
  `docs:check` fails on a backticked folder that git does not track.
- **Shortcuts and known debt**: record them in the [tech debt tracker](exec-plans/tech-debt-tracker.md).

The weekly [maintenance report](design-docs/agent-workflow.md#weekly-maintenance) flags active plans that
have not been updated in 30 days.

## Active

- [Agent harness](exec-plans/active/agent-harness.md): mechanical checks, docs, and tooling that
  let agents work reliably in this repo.
- [Harness hardening](exec-plans/active/harness-hardening.md): every verification the harness
  engineering write-up recommends, no exceptions, and no code comments.
- [D1 cost](exec-plans/active/d1-cost.md): bound rows read per request and cut write
  amplification.
- [Next.js migration](exec-plans/active/nextjs-migration.md): move the app to Next.js on
  Cloudflare Workers (OpenNext) and restyle it with default shadcn components.
- [UI decoupling](exec-plans/active/ui-decoupling.md): screens consume feature state instead of
  transport code.
- [Forms](exec-plans/active/forms.md): a Form block in a task whose fields every Run fills in,
  with required answers gating the task, in two PRs (issue #288).
- [Upload quota and ownership](exec-plans/active/upload-quota-and-ownership.md): record uploads
  in D1 for a per-account quota, Organization-owned deletes and orphan cleanup, with the
  proposed migrations.

## Completed

- [Guest runs](exec-plans/completed/guest-runs.md): signed-out visitors run public Templates in the
  browser, then save the run into an account after signing up or logging in (issue #253), in one
  PR with Required tools.
- [Public handles](exec-plans/completed/public-handles.md): one case-insensitive handle namespace
  for Users and Organizations (issue #233), in two PRs with a staging migration between them.
- [Organization public profiles](exec-plans/completed/organization-profiles.md): an Organization's
  avatar, description and public profile at `/profile/:handle`, and its Templates' URLs there
  (issue #232), in one PR.
- [Profiles directory](exec-plans/completed/profiles-directory.md): the public `/profiles/`
  directory of People and Organizations, Organizations in the profiles sitemap, and migration
  `0032` (issue #237).
- [Required tools](exec-plans/completed/required-tools.md): the tools a Template's Runs need, edited
  in the Template editor and carried by packs and MCP (issue #241), in one PR with guest runs and
  migration `0031`.
- [Sitemap revisions for Organization Templates](exec-plans/completed/sitemap-organization-templates.md):
  migration `0032` makes public Organization Template and Organization changes refresh cached
  sitemaps (TD-23).
- [Template transfer](exec-plans/completed/template-transfer.md): move a private Personal
  Template into an Organization in place (issue #236), in two PRs.
- [Run provenance](exec-plans/completed/run-provenance.md): who owns, created, started and
  completed a Run, and whether it came from the web app or an agent (issue #202), in three PRs.
- [Organization console routes](exec-plans/completed/organization-console-routes.md): the URL
  decides the Personal or Organization context (issue #212), in three PRs.

## Template

```markdown
# <Plan name>

- **Status:** active
- **Last updated:** YYYY-MM-DD
- **Goal:** <one sentence: the outcome, not the tasks>

## Progress

- [x] <done step, with PR or commit>
- [ ] <next step>

## Decision log

- YYYY-MM-DD: <decision and why; what alternative was rejected>
```
