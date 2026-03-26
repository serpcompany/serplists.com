# Checklist share run: unique token per share + old shared-run deactivation

- We observed `/api/checklists/:templateId/share` reusing the same shared run row across multiple share actions because it only updated and returned an existing run-like row.
- Fix implemented:
  - Share endpoint now creates a **new checklist run** each call with a fresh `share_token`.
  - It explicitly deactivates any prior active shared run for the same user/template by setting:
    - `is_public = false`
    - `share_expires_at = now`
    - `status = 'completed'`
    - `completed_at = now`
    - `share_used_at = now`
- Why this matters:
  - Prevents accidental reuse of guest link state.
  - Keeps older shared links from staying active/in-progress and affecting active-run limit accounting.
- Update (2026-03-21, revised route contract on 2026-03-24): Sharing is run-level in the UI, and the public guest URL is `/share/:token`.
- Update (2026-03-20): `/api/checklists/run/:runId/share` now enables sharing the current run directly and always mints a new token for that run on each request.
- Follow-up:
  - If a share action still fails with “Failed to create a share link,” check API log for 403 (`limit_reached`) vs schema errors on missing sharing columns.
