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
- [D1 cost](exec-plans/active/d1-cost.md): bound rows read per request and cut write
  amplification.
- [Sitemap revisions for Organization Templates](exec-plans/active/sitemap-organization-templates.md):
  the proposed migration that makes public Organization Template edits refresh cached
  sitemaps (TD-23).
- [UI decoupling](exec-plans/active/ui-decoupling.md): screens consume feature state instead of
  transport code.
- [Upload quota and ownership](exec-plans/active/upload-quota-and-ownership.md): record uploads
  in D1 for a per-account quota, Organization-owned deletes and orphan cleanup, with the
  proposed migrations.

## Completed

- None yet.

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
