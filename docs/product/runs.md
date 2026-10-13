# Runs

Starting a Run and the runs list, My Runs (`/dashboard/runs`). Working through a Run is in
[The run page](run-page.md), completing it in [Completing a Run](run-completion.md), its share
link in [Sharing a Run](run-sharing.md), Runs kept only in a browser in [Guest runs](guest-runs.md),
and how a Run follows its Template in [Runs follow their Template](run-template-updates.md).

Abbreviations: **Start dialog** is `tests/unit/components/ui/run-name-dialog.dom.test.tsx`,
**My Templates runs** is
`tests/unit/features/dashboard-templates/useDashboardTemplatesModel.runs.test.ts`, **Name limits**
is `tests/unit/lib/schemas/nameLimits.test.ts`, **Run names** is
`tests/unit/lib/runs/runName.test.ts`, **Long names spec** is `tests/e2e/long-run-names.spec.ts`,
**Run saves spec** is `tests/e2e/run-saves.spec.ts`, **Start dialog spec** is
`tests/e2e/run-start-dialog.spec.ts`, **Dashboard templates spec** is
`tests/e2e/dashboard-templates.spec.ts`, **Active runs** is
`tests/unit/functions/api/active-run-limit.test.ts`, **Provenance spec** is
`tests/e2e/run-provenance.spec.ts`, **Provenance panel** is
`tests/unit/components/run-execution/RunProvenancePanel.dom.test.tsx`, **Run lookup** is
`tests/unit/features/dashboard-runs/runTemplateLookup.test.ts`, **Template runs spec** is
`tests/e2e/template-runs.spec.ts`, **List load errors spec** is
`tests/e2e/list-load-errors.spec.ts`, **Row actions** is
`tests/unit/features/dashboard-runs/runRowActions.test.ts`, **Run revalidation** is
`tests/unit/features/dashboard-runs/useRunRevalidation.test.ts`, and **Conflict refresh** is
`tests/unit/contexts/editConflictRefresh.test.tsx`.

## Starting a Run

Users start Runs from Templates. Every Start Run (My Templates, Template detail and the public
Template page) opens the same Start a Run dialog: "Start a Run", a labelled "Run name" field,
"Start Run" ("Starting…" while the Run starts) and Cancel
(`src/components/ui/run-name-dialog.tsx`).

- Check: Start dialog, "RunNameDialog wording, the same wherever a Run starts: My Templates,
  template detail and the public template page" and "says Starting… and locks its buttons while the
  run starts".

My Templates starts from the Template whose card or row was clicked, and opens the new Run in the
context that owns it. On the public Template page, a visitor who is not signed in gets the same
dialog, and its Start Run starts a [guest run](guest-runs.md).

- Check: My Templates runs, "creates a run from the requested template and returns its run id"
  and "opens an Organization's new run in that Organization".

Run titles are limited to 160 characters, the same limit as Template titles, counted after
trimming (`src/lib/schemas/nameLimits.ts`, matching the API).

- Check: Name limits, "matches the limit the API enforces on run titles, after trimming" and
  "explains an empty or too long title, measured after trimming".

The dialog suggests the same default run name everywhere, `<template title> - <date and time>`,
and a run name left blank gets that default. When it would be too long, the Template title is
shortened with an ellipsis so the date and time stay.

- Check: Run names, "names the run after the template and the start time", "shortens a long
  template title so the start time stays" and "uses the default name for an empty or
  whitespace-only input".

So Start Run on a Template with a 160-character title still starts a Run.

- Check: Long names spec, "Start Run on a public template with a 160-character title creates the
  run under a shortened default name".

The Run name field stops at the limit.

- Check: Start dialog, "caps a typed run name at the API run title limit".

So does the run page's rename box, and a longer title gets a clear message instead of the API's
schema error.

- Check: Run saves spec, "the run title editor stops at the length the API accepts, and the save
  goes through".

A Start Run that fails keeps the typed name for the retry, and a cancelled dialog opens empty next
time.

- Check: Start dialog spec, "a failed start keeps the typed run name, and the retry uses it" and "a
  cancelled Start Run dialog opens empty next time".

Starting Runs is gated by plan limits on active Runs
([pricing and entitlements](pricing-and-entitlements.md)). At the limit, Start Run in Personal
opens checkout instead of only saying so.

- Check: Dashboard templates spec, "Start Run at the run limit opens checkout instead of only
  toasting".

Active-run limits count Runs until they are completed, shared Runs included: an Organization's
Runs count against the Organization, and a Personal Run against its owner.

- Check: Active runs, "counts an Organization's in-progress runs by Organization only", "counts a
  Personal context by owner outside any Organization" and "counts shared runs like any other active
  run".

## Provenance

A Run shows its provenance from what the database already records. On wide screens My Runs is a
table with each Run's Template, status, progress, who started it, its origin ("Web", "MCP" or
"Unknown") and its started and updated dates.

- Check: Provenance spec, "My Runs is a table that says who started each run and whether it came
  from the Web or MCP".

On a phone, My Runs keeps its cards.

- Check: Provenance spec, "My Runs keeps its cards, and the Run page details fit the screen".

The Run page says who started the Run and how (`Started by Codex SOP Runner via MCP · authorized by
Alice`), with Show Details for its id, Template and version, owner, creator, starter, assignee,
completer, Run Key and timestamps.

- Check: Provenance spec, "the Run page names an MCP run's Run Key and authorizer, and Show Details
  lists its provenance".

An older Run with no record says "Unknown" or "Not recorded", never a guess
([data persistence](../agents/data-persistence.md#run-provenance)).

- Check: Provenance panel, "says Unknown and Not recorded for an older run, never a guess".

## My Runs

My Runs filters by Template, status and search, which combine.

- Check: Run lookup, "keeps only the chosen Template's runs, together with the status and search
  filters".

The Template filter is in the URL (`?template=<id>`), so a link, a reload and Back keep it, and
"View runs" on a Template's page opens the runs of the context that page shows, filtered to that
Template.

- Check: Template runs spec, "View runs on an Organization Template opens that Organization's runs
  of it, which a reload keeps and Status narrows" and "choosing a Template on the runs page writes
  it to the URL, and a search that matches none of its runs says so".

A Template with no runs says "No runs of this template yet", with "Show all runs" to clear the
filter, apart from the general "No runs found".

- Check: Template runs spec, "a Template with no runs says so, and Show all runs clears the
  filter".

The list links each Run to its source Template and matches searches on that Template's title and
owner. The source can be a public catalog Template or one of the viewer's Personal or active
Organization Templates, public or private. Runs started from library Templates have no source
link.

- Check: Run lookup, "includes private workspace Templates that the public catalog never returns",
  "finds a renamed run by its private source Template title and owner" and "never matches a run
  started from a library Template (empty template id)".

When the runs fail to load, My Runs shows Retry, never an empty list.

- Check: List load errors spec, "My Runs shows Retry instead of an empty list when the runs fail
  to load".

On an Organization's Runs, a viewer gets no actions, runners and editors can share and revalidate
but not delete, and admins can delete.

- Check: Row actions, "gives an Organization viewer no actions", "lets runners and editors share
  and revalidate but not delete" and "lets admins delete Organization runs".

Each Run's Revalidate stays disabled until that Run's own request finishes, even while other Runs
revalidate, so pressing it again sends no second request.

- Check: Run revalidation, "keeps each run busy until its own request finishes" and "sends one
  request per run however often its Revalidate is pressed, since a second would carry the same
  revision and fail with 409 edit_conflict".

A Revalidate refused because the list was out of date (`409 edit_conflict`,
`409 shared_run_conflict` or a `404`) reloads the list before the button re-enables, so the next
click sends the current revision.

- Check: Conflict refresh, "refreshes the runs list before Revalidate rejects, so the next click
  sends the new revision".
