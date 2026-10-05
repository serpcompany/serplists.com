# Guest runs

- **Status:** active
- **Last updated:** 2026-10-05
- **Goal:** A visitor who is not signed in can run a public Template in the browser, and after
  signing up or logging in can save that run into their account (issue #253).

## Progress

The work ships in one PR together with Required tools (#241) (owner, 2026-10-05: a couple of
self-contained PRs at most, never one stacked on another). It was built in the two steps below.

- [x] PR 1 (`fl/guest-runs`): Start Run for signed-out visitors on the public template page
  (the same Start a Run dialog), the guest run page at `/profile/:user/:slug/run/`, the run kept
  in localStorage with tasks, Sub-tasks, notes and completion on the run page's own model and
  components, one active guest run per Template ("Continue Run"), Delete run, no sharing, and a
  `noindex, follow` page.
- [x] PR 2 (`fl/guest-runs-save`): after sign-up or log-in, offer to save the
  guest run into the account: "Log in or sign up to save it to your account." on the guest run
  page (both links return to it), "Save to account" there and in a notice on the public template
  page, a real Run started through the existing API with the progress carried over by stable
  ids, and plan limits handled as Start Run handles them.
- [ ] Merge PR 1, then PR 2, into `staging`; check both pages with `pnpm run ui:snap` at desktop
  and 390px, signed out and signed in.
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
- 2026-10-05 (PR 2): Saving reuses Start Run's path, `startTemplateRun` with the Templates
  context's `createRun`, so the Run lands in the active ownership context with the same plan
  gates and messages (Personal checkout at the Free plan's active-run limit, the Organization's
  paid-plan message). It then loads the created Run by id and carries progress onto the content
  the server copied, rather than sending the guest run's own snapshot, which would leave the
  Run's sections older than the Template version it records. One more request, no new API.
- 2026-10-05 (PR 2): The offer appears where a signed-in user meets the guest run again: the guest
  run page (Log in and Register return there, through email verification too) and a notice on
  the public template page. No global prompt in the console: the template page and the run link
  are where the run is found.
- 2026-10-05 (PR 2): The browser's copy is removed only once the progress is saved. If that save
  fails after the Run was created, the guest run stays and the empty Run remains in My Runs;
  retrying starts another Run. Accepted for now: it needs a failure between two requests that
  just succeeded.
- 2026-10-05 (PR 2): Notes typed but not saved on the guest run page go into the saved Run, and
  the leave guard lets the page go once the save lands.
- 2026-10-05 (PR 2): New wording: "Save to account", "Run saved to your account", "Log in or
  sign up to save it to your account." and "Your run of this Template is saved in this browser
  only."
- 2026-10-05: The guest Run page shows the Template's Required tools as a compact card, as the
  Run page does, from the public Template it loads (a guest Run stores only the sections).
- 2026-10-05: The guest Run page follows the Template page's owner-qualified lookup (#232): an
  Organization Template's guest Run at its Creator's old URL answers a 308 to the Organization's
  `…/run/` URL, keeping the query string, so links from before #232 still open the run.
