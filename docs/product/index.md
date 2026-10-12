# Product docs

What SERP Lists does today, from the user's point of view: one doc per page, screen or endpoint
group, each behavior with the automated check that proves it. The docs change with the code and
are not a roadmap; planned work lives in issues. What every page keeps to is in
[Product principles](principles.md), and the product's terms are in
[`CONTEXT.md`](../../CONTEXT.md).

## How behavior is verified

Under its title and a line on what it covers, each doc (except this index and the principles)
names the test files its checks come from:

```markdown
Abbreviations: **Archive spec** is `tests/e2e/archive-restore.spec.ts`, and **Restore on D1** is
`tests/unit/functions/api/archive-restore-not-archived-d1.test.ts`.
```

Each behavior, a paragraph or a bullet that says what the product does, is followed by one check
line: an abbreviation, then the exact title of each test that proves it, in double quotes. A
behavior no test proves yet says so.

```markdown
- Check: Archive spec, "an archived template and run can be restored from the archive page".
- No automated check yet.
```

The checks come in three kinds:

- **Browser tests** (Playwright) in `tests/e2e/`, whose abbreviations end in "spec". They open the
  production build on an isolated local stack at desktop and phone widths: `pnpm run test:smoke`
  runs those tagged `@smoke` (a tag a doc may leave out of a title), and `pnpm run test:e2e:full`
  runs them all. Pull requests run them in their own workflow.
- **Unit tests** (Vitest) in `tests/unit/`, run by `pnpm run test:run`. Those named `*-d1.test.ts`
  run the API's handlers on the migrated tables.
- **Local D1 tests** in `tests/integration/`, run against a real local D1 by
  `pnpm run test:local-d1`.

`pnpm run verify docs` fails a check line whose abbreviation is unknown, whose file does not
exist, or whose title no test has, and says how to fix it: give the doc the test's new title, or
restore the test. The weekly maintenance report counts the behaviors without a check. A pull
request that changes behavior changes its product doc and its check in the same pull request.

## Templates

- [Templates](templates.md): My Templates and a Template's detail page: who manages it, Duplicate
  and copy, Export JSON, Share and visibility, Transfer to Organization, and Activity.
- [Template editor](template-editor.md): who gets the editor, saving and conflicts, reordering,
  phones, Forms, field limits, slugs, and Search & SEO.
- [Required tools](required-tools.md): the tools a Run of a Template needs, from the editor to the
  Run page, agents and files.
- [Public Templates](public-templates.md): a public Template's page, its Template Owner and one
  URL, what a viewer can do, copying, and link previews.
- [Template library and categories](template-library.md): `/templates`, `/categories` and each
  category's page.
- [Delete and the archive](archive.md): what Delete does to a Template or a Run, and restoring
  from `/dashboard/archive`.
- [Import and export](template-import-export.md): the Import/Export page, and exporting a
  context's Templates as a portable pack or a backup.
- [Importing Templates](template-import.md): the files an import reads, the summary it returns,
  the limits a file must keep, and new Templates' slugs.
- [Portable templates](portable-templates.md): the portable template pack format and its
  versions.
- [Template storage](template-storage.md): how D1 stores a Template's and a Run's content, checks
  every write, and keeps ids stable.
- [Authoring templates as files](template-authoring.md): writing a Template in YAML or strict
  Markdown, the generated previews, and copy-paste examples.

## Runs

- [Runs](runs.md): starting a Run, its name, and My Runs with its provenance and filters.
- [The run page](run-page.md): working through tasks, Sub-tasks and notes, and how saves behave.
- [Forms on a Run](run-forms.md): filling in a task's Form, and exporting the answers.
- [Completing a Run](run-completion.md): completing, the freeze, reopening, and who completed it.
- [Sharing a Run](run-sharing.md): share links, Stop sharing, and what a link holder can do.
- [Guest runs](guest-runs.md): running a public Template in the browser without an account, and
  saving it into one.
- [Runs follow their Template](run-template-updates.md): how Template changes reach Runs,
  staleness, Revalidate, and the run source rule.

## Agents

- [Run Keys](run-keys.md): what an agent can do with a Personal Run Key over MCP.
- [MCP changes for agents](mcp.md): the Run Key MCP endpoint's release notes.

## Accounts, Organizations and plans

- [Auth and account](account.md): sign-up, sign-in, Account Settings, and public Profiles.
- [Dashboard navigation](dashboard.md): the console routes in Personal and in each Organization.
- [Personal and Organization contexts](contexts.md): which context owns what, and what each role
  may do.
- [Pricing and entitlements](pricing-and-entitlements.md): Free, Pro, and paid
  Organization capabilities, limits, upgrade triggers, and how pages answer a plan gate.
- [Billing and checkout](billing-and-checkout.md): Pro checkout, the Customer Portal and their
  refusals, subscription status, how a page reads the plan, and plans support manages.

## API and policies

- [Error contract](api-errors.md): how the API reports errors.
- [Privacy](privacy.md): what SERP Lists collects, why, how long it keeps it, and how to opt out or
  ask for deletion. The site has no privacy policy page yet.
- [Product principles](principles.md): what every page and endpoint keeps to, and how its copy is
  written.
