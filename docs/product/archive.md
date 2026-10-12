# Delete and the archive

What Delete does to a Template or a Run, and how the archive page, `/dashboard/archive`, brings it
back. The console sidebar links the page.

Abbreviations: **Archive spec** is `tests/e2e/archive-restore.spec.ts`, **Runs list** is
`tests/unit/components/dashboard/RunsDashboardView.dom.test.tsx`, **Template history** is
`tests/unit/features/template-detail/templateHistoryTimeline.test.ts`, **Template archive API**
is `tests/unit/functions/api/templates-handler.archive.test.ts`, **Run archive API** is
`tests/unit/functions/api/checklists-handler.archive.test.ts`, **Archive page** is
`tests/unit/components/ArchiveRecoverySection.test.tsx`, **Organization roles spec** is
`tests/e2e/organization-roles.spec.ts`, **Archive restore** is
`tests/unit/features/archive/archiveRecovery.test.ts`, and **Restore on D1** is
`tests/unit/functions/api/archive-restore-not-archived-d1.test.ts`.

## Delete

Users delete Templates and Runs. My Templates and the Template detail page call the action Delete
("Delete template", "Template deleted"), and the confirmation asks "Are you sure you want to delete
...?" and never says the action cannot be undone, since the archive restores it.

- Check: Archive spec, "a template deleted from My Templates never says it cannot be undone and
  restores from the archive".

My Runs does the same for a Run ("Delete run").

- Check: Runs list, "names the action Delete and never says it cannot be undone, since the API only
  archives the run, which /dashboard/archive restores".

The Activity and the Organization activity say Deleted ("Deleted template" in a Template's
Activity).

- Check: Template history, "shows archive, restore and visibility changes between versions, newest
  first".

Behind the scenes the API archives a Template: it sets `deleted_at` and makes the Template
private, and reads then treat it as not found.

- Check: Template archive API, "should archive templates with deleted_at instead of hard deleting"
  and "should hide archived templates from normal detail reads".

Archiving a Run sets `deleted_at` and ends its share link.

- Check: Run archive API, "should archive checklist runs with deleted_at instead of hard deleting"
  and "should hide archived checklist runs from normal detail reads".

A Template deleted from its own page is not read again, and opens normally once restored.

- Check: Archive spec, "a template deleted from its page is not read again and opens normally once
  restored".

## The archive page

`/dashboard/archive` lists the active context's archived Templates and Runs and restores them. A
deleted item shows there without a reload.

- Check: Archive spec, "an archived template and run can be restored from the archive page" and "a
  deleted run appears in the archive without a reload".

The page never reads as empty before its lists load: it shows loading, then the lists, and a list
that failed to load shows Retry and claims no total.

- Check: Archive page, "ArchiveRecoverySection never reads as empty before its lists load, since a
  user who just deleted something would think it gone for good".

In an Organization, every member sees both lists, but Restore is offered only to roles the API
allows: editors and above for Templates, admins and above for Runs.

- Check: Organization roles spec, "an Organization editor can restore archived Templates but not
  runs".

In Personal, the owner restores both.

- Check: Archive page, "offers Restore on both lists in Personal".

A restored Template or Run comes back private, and the restore is recorded in its Activity.

- Check: Template archive API, "should restore archived templates privately and audit the
  restore".

Restoring respects plan limits and shows the API's reason when it refuses. A role refusal (a role
changed since the page loaded) says the role cannot restore Templates or Runs.

- Check: Archive restore, "describeRestoreError" and "keeps the API's reason for a plan limit and
  other failures".

An item already restored elsewhere (another tab, a teammate, or a concurrent request) answers
`400 not_archived` and records nothing.

- Check: Restore on D1, "answers a Template restored elsewhere with code not_archived and records
  nothing" and "answers a Run restored elsewhere with code not_archived and records nothing".

Then, or when the item is gone (`404`), the page reloads its archive and the Template and Run
lists and says so, so the row does not keep a Restore that fails every time.

- Check: Archive spec, "an item restored elsewhere leaves the archive when Restore finds it already
  restored".
