# Template Transfer

- **Status:** active
- **Last updated:** 2026-10-04
- **Goal:** a User moves one of their private Personal Templates into an Organization they can
  add Templates to, in place, without copying it or moving its Runs (issue #236). No migration.

## Progress

- [ ] PR 1: `POST /api/templates/:id/transfer` with the `template.transferred_to_organization`
  audit action and version, guarded in one batch, with local-D1 integration tests.
- [ ] PR 2: "Transfer to Organization" in the Template actions menu of a private Personal
  Template: a dialog that lists the Organizations the user can add Templates to, warns that
  existing Personal Runs stop syncing, then refreshes both libraries and opens the Template at
  its Organization's URL. Browser test.

## Decision log

- 2026-10-04: The action is "Transfer to Organization" and the audit action
  `template.transferred_to_organization` (owner decision on #236), labelled "Transferred to
  Organization" in a Template's Activity and "Template transferred in" in Organization activity.
- 2026-10-04: Only private Templates transfer for now. A public Template answers
  `409 template_public`: a public Organization Template's URL depends on Organization profiles
  (#232), so transferring a public one would either move or break its public URL.
- 2026-10-04: The receiving Organization's Template limit applies, checked before and inside the
  write, as Template creation and copies do.
- 2026-10-04: The transfer bumps `version` (so an editor open on the old version conflicts) and
  writes a version snapshot like every other Template change, but not `content_version`: the
  content is unchanged, so no Run turns stale.
- 2026-10-04: Existing Personal Runs stay in Personal. A private Organization Template never
  supplies a Personal Run, so they stop revalidating from it; the dialog says so first.
