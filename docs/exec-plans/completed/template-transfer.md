# Template Transfer

- **Status:** completed
- **Last updated:** 2026-10-05
- **Goal:** a User moves one of their private Personal Templates into an Organization they can
  add Templates to, in place, without copying it or moving its Runs (issue #236). No migration.

## Progress

- [x] PR 1: `POST /api/templates/:id/transfer` with the `template.transferred_to_organization`
  audit action and version, guarded in one batch, with local-D1 integration tests.
- [x] PR 2: "Transfer to Organization" in the Template actions menu of a Personal Template
  the user owns: a dialog that lists the Organizations the user can add Templates to, warns that
  existing Personal Runs no longer receive its changes, then refreshes both libraries and opens
  the Template at its Organization's URL. Unit, DOM and browser tests
  (`template-transfer.spec.ts`).

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
- 2026-10-04: The menu item shows for a public Personal Template too, and its dialog says to
  make it private first, so the owner learns why the transfer is unavailable instead of
  missing the item.
- 2026-10-04: The page writes the new owner into the Template it shows instead of navigating
  itself, so the redirect that already moves a private Organization Template off another
  context's URL opens it at its Organization's (a URL replace: Back skips the Personal URL). An
  explicit navigation after the list refresh would race that redirect, and a redirect that
  lands first ends the page visit, so the success toast does not wait on the visit.
