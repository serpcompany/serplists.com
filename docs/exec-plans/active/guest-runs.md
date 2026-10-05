# Guest runs

- **Status:** active
- **Last updated:** 2026-10-05
- **Goal:** A visitor who is not signed in can run a public Template in the browser, and after
  signing up or logging in can save that run into their account (issue #253).

## Progress

- [x] PR 1 (`fl/guest-runs`): Start Run for signed-out visitors on the public template page
  (the same Start a Run dialog), the guest run page at `/profile/:user/:slug/run/`, the run kept
  in localStorage with tasks, Sub-tasks, notes and completion on the run page's own model and
  components, one active guest run per Template ("Continue Run"), Delete run, no sharing, and a
  `noindex, follow` page.
- [ ] PR 2 (`fl/guest-runs-save`, stacked on PR 1): after sign-up or log-in, offer to save the
  guest run into the account: start a real Run through the existing API and carry the progress
  over by stable ids, handling plan limits (the Free plan's active-run limit) gracefully.
- [ ] Owner's open question, not built: whether code projects and SKILL.md files need more than
  a plain link that opens the run (a machine-readable SOP on the public page).

## Decision log

- 2026-10-04 (owner, on #253): signed-out visitors get Start Run on the public Template page,
  and the run happens in the browser at `/profile/:user/:slug/run/`. Progress lives only in
  localStorage and nothing is written to the server, so no rate limits, abuse protection or
  migration. One active guest run per Template. After sign-up or log-in, offer to save the guest
  run into the account. Tasks, Sub-tasks and notes work; guest runs can't be shared.
- 2026-10-05: Two PRs: the guest run itself, then the save into the account, which needs the
  sign-in flow and the plan limits.
- 2026-10-05: A guest run is a snapshot of the Template's sections when it started, stored whole
  (`serplists:guest-run:<templateId>`), not progress laid over the current Template: it is a Run
  ("an execution snapshot"), a completed run stays frozen as it was, and no reconciliation exists
  outside the API to reuse. A Template edit therefore does not reach a guest run in progress;
  Delete run and Start Run give the visitor the current version. Saving it into an account (PR
  2) carries progress over by stable ids onto a Run started from the Template's current content.
- 2026-10-05: The page reuses the run page's model and components rather than copies:
  `useRunExecutionModel` takes a `guest` source (its load and `updateRun`), and the run page's
  body, header parts and handlers moved into `RunWorkspace`, `RunStatusMeta`,
  `CompleteRunButton` and `useRunPageActions`, which both pages render. The run's inner column is
  a `div` now: the public shell and the console's `SidebarInset` already render `<main>`.
- 2026-10-05: Signed-out Start Run opens the same Start a Run dialog as everywhere else (one way
  to start a Run, and the name carries into the account in PR 2). A plain link to the run page
  starts a run with the default name when the browser has none, which is the "plain link that
  opens the run" the owner asked for; a signed-in user with no guest run is sent to the template
  page, where Start Run starts a Run in the account.
- 2026-10-05: One active run per Template: while one is in progress the template page's Start
  Run buttons become "Continue Run" links, and starting again (another tab, a repeated confirm)
  returns that run. A completed guest run is replaced by the next Start Run. Delete run removes
  the entry after the usual "Delete run" confirmation; a guest run has no Archive.
- 2026-10-05: Two tabs on one guest run: each stored run has a revision, and a save on another
  revision (or a deleted or replaced run) fails with the `409 edit_conflict` an API save gets, so
  the existing saver reloads and retries on the stored run. No `storage` listener: a code
  convention keeps those to the theme and the session, and the revision check covers a stale
  tab's next save.
- 2026-10-05: The run page is `noindex, follow` with the Template page's title and description
  and no canonical URL: it shows one visitor's progress and repeats the Template page, which
  stays the indexed page.
- 2026-10-05: New wording kept to two strings: "Continue Run" and "This run is saved in this
  browser only." Everything else on the page is the run page's existing text.
