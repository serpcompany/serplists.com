# Guest runs

Running a public Template in the browser without an account, at
`/profile/{handle}/{templateSlug}/run/`, and saving that run into an account.

Abbreviations: **Public page actions** is `tests/unit/views/PublicTemplate.actions.dom.test.tsx`,
**Guest run spec** is `tests/e2e/guest-run.spec.ts`, **Guest store** is
`tests/unit/features/guest-runs/guestRunStore.test.ts`, **Guest model** is
`tests/unit/features/guest-runs/useGuestRunModel.dom.test.tsx`, **Guest run page** is
`tests/unit/views/GuestRun.dom.test.tsx`, **Guest page meta** is
`tests/unit/server/pageMeta/guestRunPage.test.ts`, **Organization pages** is
`tests/unit/server/pageMeta/organizationPages.test.ts`, **Guest save spec** is
`tests/e2e/guest-run-save.spec.ts`, **Guest save** is
`tests/unit/features/guest-runs/saveGuestRunToAccount.test.ts`, **Guest progress** is
`tests/unit/features/guest-runs/guestRunProgress.test.ts`, **Guest form progress** is
`tests/unit/features/guest-runs/guestRunProgress.forms.test.ts`, and **Guest save hook** is
`tests/unit/features/guest-runs/useSaveGuestRunToAccount.dom.test.tsx`.

## Running without an account

A visitor who is not signed in can run a public Template in the browser, without an account: on
the public Template page, the Start a Run dialog's Start Run starts a guest run in that browser.

- Check: Public page actions, "offers a visitor who is not signed in the same dialog, and starts
  the run in this browser, never through the API".

The run lives only in that browser's localStorage, keyed by Template
(`src/features/guest-runs/guestRunStore.ts`), and nothing about it is sent to the server, so it
needs no rate limit or account. Coming back keeps its progress and notes.

- Check: Guest run spec, "a visitor who is not signed in runs a public Template in the browser, and
  coming back keeps the progress and notes".

It is a snapshot of the Template's sections when it started.

- Check: Guest store, "copies the Template's sections into a new in-progress run with every task
  and Sub-task unticked".

It works like any Run, on the run page's own components and rules: tasks, Sub-tasks (a task with
Sub-tasks is done exactly when all of them are) and notes, the completion prompt, and a completed
run frozen.

- Check: Guest model, "completes a task once its last open Sub-task is ticked, and Mark Complete
  ticks every Sub-task, as on any run" and "completes the run once every task is done and freezes
  its tasks".

Its page says "This run is saved in this browser only." and offers "Complete run" and "Delete run"
("Are you sure you want to delete this run?", then back to the Template page with "Run deleted"),
but no Share or Rename: a guest run can't be shared, and the same address shows each visitor their
own run. Completing it keeps the visitor on it, completed and frozen.

- Check: Guest run spec, "Delete run asks first, goes back to the Template page, and Start Run
  starts afresh" and "completing the run keeps the visitor on it, completed and frozen, and the
  Template page starts a new one".

Each Template has one active guest run per browser: while one is in progress, the public Template
page's Start Run buttons read "Continue Run" and open it, and starting again after it is completed
replaces it.

- Check: Guest run spec, "the Template page offers the run in progress instead of a second one, and
  a plain link opens it too".

A plain link to the run page opens the visitor's run, and starts one with the default name when
there is none, so code projects and SKILL.md files can link straight to it.

- Check: Guest run spec, "a plain link to the run page starts a run named after the Template for a
  visitor who has none".

A signed-in user with no guest run there goes to the Template page instead.

- Check: Guest run spec, "a signed-in user who opens the run link with no run in this browser lands
  on the Template page".

The run page is `noindex, follow` and names no canonical URL.

- Check: Guest page meta, "names the Template as its page does but keeps the run page out of
  search and names no canonical URL".

An Organization's Template runs under the Organization's handle; the guest run at its Creator's old
URL moves there, keeping the query string.

- Check: Organization pages, "moves the guest run at its Creator's URL to the Organization's,
  keeping the query string".

Two tabs on the same guest run never overwrite each other's ticks: a save made on an older copy
reloads the stored run and is applied on top of it, as a run saved elsewhere is.

- Check: Guest model, "applies a tick on top of what another tab saved first, keeping that tab’s
  progress" and "keeps notes typed here when another tab saved different notes for that task first,
  and says so".

The page shows the Template's Required tools above the run, as the Run page does.

- Check: Guest run page, "shows the Template's Required tools above the run, as the Run page does".

It works at phone width, with no sideways scroll, and its Tasks sheet opens any task.

- Check: Guest run spec, "the guest run page works at phone width: no sideways scroll, and the
  Tasks sheet opens any task".

## Saving into an account

Signed out, the page adds "Log in or sign up to save it to your account." Both links return to the
run page, through email verification too.

- Check: Guest run page, "asks a visitor who is not signed in to log in or sign up to save it, and
  to come back to the run after".

Signed in, the run page offers "Save to account" to roles that can start runs.

- Check: Guest run page, "offers a signed-in user Save to account, which saves the notes still
  being typed too" and "offers no Save to account to a role that cannot start runs in the active
  Organization, and waits while a save runs".

So does the public Template page while the browser holds a run of it ("Your run of this Template is
saved in this browser only.").

- Check: Public page actions, "offers a signed-in user to save the run this browser holds into
  their account, and a visitor not signed in nothing of the kind".

Saving starts a Run of the Template in the active ownership context under the guest run's name,
exactly as Start Run does, then carries the progress onto it.

- Check: Guest save, "starts a Run of the Template under the guest run’s name, carries the progress
  onto the stored run, and clears the browser’s copy".

The progress carries by stable ids: each task's tick and notes (notes still being typed included),
and each Sub-task by id or, without one, by its place, with a task that has Sub-tasks done exactly
when all of them are.

- Check: Guest progress, "copies ticks and notes task by task, by id, whatever order the new run
  holds them in", "finds a Sub-task by its id even when it moved, and by its place when it has
  none" and "keeps a task with Sub-tasks done exactly when all of them are, so a Sub-task the guest
  run never had reopens it".

A completed guest run makes the Run completed when every task carried over done.

- Check: Guest progress, "completes the new run when the guest run was completed and every task
  carried over done, keeping its completion time" and "keeps the new run in progress when the
  Template has gained a task since the guest run was completed".

Form answers carry by field id, and a task whose Form blocks it is not carried as done.

- Check: Guest form progress, "copies each answer by field id, whatever order the fields are in
  now, and keeps the task done" and "does not carry a task as done when its form now blocks it, and
  so does not complete the run".

The guest run then leaves the browser, the toast says "Run saved to your account", and the new Run
opens.

- Check: Guest save hook, "saves the run with the notes still being typed, says so, and opens the
  new Run".

A visitor who logs in from the guest run saves it the same way, progress and notes included.

- Check: Guest save spec, "a visitor who logs in from the guest run saves it into their account,
  progress and notes included".

Plan limits are handled as Start Run handles them: at the Free plan's active-run limit, Personal
checkout starts, and the guest run stays in the browser.

- Check: Guest save spec, "a signed-in user at the active-run limit is sent to checkout from the
  Template page and keeps the guest run".

In an Organization, the page says the Organization needs a paid plan instead.

- Check: Guest save hook, "explains that the Organization needs a paid plan instead of starting a
  Personal checkout".
