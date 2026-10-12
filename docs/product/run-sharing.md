# Sharing a Run

A Run's share link, `/share/:token`: making one, stopping it, and what someone with the link can
do.

Abbreviations: **Share API** is `tests/unit/functions/api/checklists-handler.sharing.test.ts`,
**Share spec** is `tests/e2e/run-share.spec.ts`, **Run page link** is
`tests/unit/features/run-execution/useRunShareLink.dom.test.tsx`, **Share from list** is
`tests/unit/features/dashboard-runs/shareRun.test.tsx`, **Share secrets** is
`tests/unit/functions/api/checklists-share-secrets.test.ts`, **Shared run spec** is
`tests/e2e/shared-run.spec.ts`, **Stop sharing API** is
`tests/unit/functions/api/checklists-share-revoke.test.ts`, **Shared run lookup** is
`tests/unit/functions/shared-run-lookup.test.ts`, **Runs page** is
`tests/unit/views/DashboardRunsPage.test.tsx`, **Sharing on D1** is
`tests/integration/run-sharing-local-d1.test.ts`, **Shared run API** is
`tests/unit/functions/api/checklists-shared-handler.test.ts`, **Shared run merge** is
`tests/unit/functions/api/shared-run-merge.test.ts`, and **Shared page meta** is
`tests/unit/server/pageMeta/sharedRunPage.test.ts`.

## Sharing

Run-level sharing creates public `/share/:token` links (`POST /api/checklists/run/:id/share`).
Anyone who may update the Run can share it; an Organization viewer cannot.

- Check: Share API, "should create share links for personal checklist run owners", "should create
  share links for team checklist runs when the user can run team templates" and "should reject team
  checklist share links for viewers".

Sharing again mints a new link, and the previous one stops working.

- No automated check yet.

The run page and the runs list show the created link in a dialog with a Copy button, so it is
never lost when the browser refuses the automatic copy.

- Check: Share spec, "the run page shows the share link when the clipboard refuses the copy, and
  the same link when reopened" and "the runs list shows the share link when the clipboard refuses
  the copy".

Reopening Share on the same page shows that link again while the page shows the Run shared, and
makes a new one once the page shows the Run private (sharing was stopped in another tab or by a
teammate).

- Check: Run page link, "reopens the link it made while the run is shown shared" and "makes a new
  link once the page reloads the run as private, as after another tab stopped sharing it".

Sharing from the run page keeps unsaved task notes and the open task.

- Check: Share spec, "sharing from the run page keeps unsaved task notes and the open task".

The runs list shows a Run as shared right away, so a stale shared Run reads "Shared snapshot is out
of date" and is not offered Revalidate.

- Check: Share spec, "sharing a stale run from the runs list stops offering Revalidate".

It marks the Run shared as soon as the link exists, even when the copy fails, and leaves it
private when the share fails.

- Check: Share from list, "marks the cached run shared as soon as the link exists, even when the
  copy fails" and "leaves the run private when the share fails".

Run reads never return share tokens, which let anyone holding one edit the Run; only the share
endpoint hands out the link.

- Check: Share secrets, "run reads never return share tokens, which let anyone holding one edit the
  run".

## Stop sharing

Stop sharing (`DELETE /api/checklists/run/:id/share`, in the runs list menu and next to Share on
the run page, which also marks a shared Run) makes the Run private and turns its link off; progress
and tasks are kept, and the run page keeps saving.

- Check: Shared run spec, "stopping a share from the runs list turns the guest link off" and
  "stopping a share from the run page turns the guest link off, and the page keeps saving".

Anyone who may update the Run can stop sharing it: an Organization runner can, a viewer cannot.

- Check: Stop sharing API, "lets an Organization runner stop sharing an Organization run" and
  "refuses an Organization viewer".

A stopped link stops at once: the shared page reads the Run from D1 on every visit.

- Check: Shared run lookup, "names nothing once sharing stops or the run is archived, reading D1
  each time so a revoked link stops at once".

The runs list marks shared Runs, and a shared Run that went stale offers "Stop sharing to update",
after which it can be revalidated.

- Check: Runs page, "marks shared runs so owners can see which links are live" and "offers Stop
  sharing to update, which makes the run private and revalidatable, instead of a revalidation that
  must fail on a shared snapshot".

Stopping twice records one event and keeps the Run's progress.

- Check: Sharing on D1, "turns the link off with one audit event even when stopped twice, keeps
  the run's progress, and allows revalidation again".

## On the shared link

Guests open shared Runs without logging in and update them, and the page and the share dialog say
what they may do ("Anyone with this link can tick tasks, add notes and complete this Run."). A
guest who completes the Run stays on it, and it reads Completed.

- Check: Shared run spec, "a share-link guest is told what they may do, completes the Run and stays
  on it, which then reads Completed".

A guest can change task and sub-item completion, task notes (up to 5,000 characters) and the Run's
status, and cannot rewrite or wipe the Run.

- Check: Shared run spec, "a share-link guest can tick tasks but cannot rewrite or wipe the run".

The server merges only those fields onto the stored Run by task id: titles, descriptions, contents
and the task list itself always come from the stored Run, and progress and completion time are
computed on the server.

- Check: Shared run API, "applies only completion from a payload that also rewrites titles,
  contents, and adds tasks", "keeps the stored tasks when a guest sends an empty sections list" and
  "stores server-computed progress and ignores client progress and completed_at".

Notes a guest changes are held to the cap, and long notes the owner already saved stay as they are
when the guest leaves them unchanged.

- Check: Shared run merge, "saves notes and rejects changed notes over the cap" and "accepts long
  notes the owner already saved when the guest leaves them unchanged".

Shared Runs do not expose owner-only title editing or destructive actions, and the guest view does
not reveal who owns or worked on the Run: guests get exactly the fields the share page needs.

- Check: Share API, "gives share-link guests exactly the run fields the share page needs, so a
  column added later stays private" and "should serve shared checklist runs without
  authentication".

A share-link edit names its signed-in editor in the Run's Activity only when they belong to the
Run's Organization.

- Check: Sharing on D1, "names a share-link editor only when they belong to the run's
  Organization".

Shared run pages stay out of search, and an unknown or stopped link names nothing.

- Check: Shared page meta, "names the shared run and keeps it out of search" and "names nothing for
  an unknown or blank token".
