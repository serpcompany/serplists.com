# Required Tools

- **Status:** completed
- **Last updated:** 2026-10-06
- **Goal:** a Template lists the tools a Run of it needs ("Required tools": a name, a link, and
  required or optional), edited in the Template editor and shown on the public Template page,
  Template detail and the Run page, carried by portable packs, exports, imports and MCP
  `get_template` (issue #241). Integrations that act on a Run are a separate, later issue.

## Progress

The work ships in one PR together with guest runs (#253) (owner, 2026-10-05: a couple of
self-contained PRs at most, never one stacked on another). It was built in the two steps below.

- [x] PR 1 (`fl/required-tools`): migration `0031` adds `templates.required_tools`; the shared
  schema `src/lib/schemas/requiredTools.ts`; create, save, read by id or slug (public ones to
  anyone), copies (Duplicate's create, clone into Personal or an Organization), delete and
  restore, transfer, version snapshots, portable packs, backups, imports (JSON, Markdown, YAML)
  and the bundled library carry the tools; a Run reads its source Template's tools under the run
  source rule; MCP `get_template` returns them and the MCP server goes to 0.4.0. Tests on the
  migrated tables (`template-required-tools-d1.test.ts`, `template-required-tools-pack-d1.test.ts`,
  `agent-mcp-required-tools.test.ts`) and the pack schema parity cases.
- [x] PR 2 (`fl/required-tools-ui`): the editor's Required tools fields in
  Template Settings (`RequiredToolsEditor`, with the save rules in
  `src/lib/forms/templateEditorRequiredTools.ts`), and `RequiredToolsList` on the public Template
  page, Template detail, the Run page (a card under the provenance) and the editor preview, with
  DOM tests and a browser spec (`tests/e2e/required-tools.spec.ts`, not yet run).
- [x] Merged into `staging` with guest runs as #283 (2026-10-05). `0031` applied to staging
  afterwards (owner go-ahead): Time Travel bookmark
  `00000ac0-00000000-000050fb-77a3815c06fccaa522ab8e33d9aa9694` noted first, `verify:staging`
  passes, and the staging deploy ran.
- Production moved to the launch steps in the [Next.js migration plan](../active/nextjs-migration.md#left-for-launch).

## Rollout and rollback

The change is additive: one nullable column, no backfill, no index. Code that predates it never
names the column, and a save that leaves `requiredTools` out keeps what is stored, so deploy order
only matters one way: the column must exist before code that reads it ships, which the pending
migration check enforces. To remove the feature, ship code that no longer reads the column, then a
new migration that drops it; never edit `0031`.

## Decision log

- 2026-10-04: Owner decisions on #241: the name is "Required tools"; each tool has a name, a URL
  and required or optional; the list shows on the public Template page, Template detail and the
  Run page and travels in portable packs, exports and MCP `get_template`; it is stored in a new
  nullable JSON column, applied locally and to staging, with production waiting; affiliate links
  are undecided, so links are plain; integrations that act on a Run are a later issue.
- 2026-10-05: The migration is `0031`: `0030` is reserved by the Organization avatar and
  description PR in flight, and `0028`/`0029` are the public handle registry and sitemap triggers.
- 2026-10-05: A tool is `{ name, url, required }` with no id. Nothing refers to one tool yet; the
  later integrations issue can add ids additively.
- 2026-10-05: Limits, enforced by the API on every write and import: at most 20 tools (the
  category and tag list limit), names of at most 80 characters (the category and tag length) and
  not blank, URLs of at most 2048 characters (the sitemap protocol's URL limit and the common
  browser-safe length). A URL must be `http://` or `https://` with a host, and hold no spaces,
  `<`, `>` or `"` (what the app's link check refuses), so every stored tool can be linked as it
  is and a `javascript:` or `data:` link is never stored. The rule is a plain pattern that every
  JSON Schema validator reads the same way: no Unicode property classes.
- 2026-10-05: The pack format and its JSON Schema check a tool's shape but not its lengths, as
  they do for titles and tags: JSON Schema counts code points where the importer counts UTF-16
  units, so a length in both would break the parity the JSON Schema promises. The API refuses a
  too-long tool on import with `invalid_fields`.
- 2026-10-05: A tool written without `required` (a hand-written pack) reads as required, since the
  list is named Required tools.
- 2026-10-05: Only reads of one Template select the column (by id or slug, the save's own read,
  copies, exports, MCP `get_template`); lists never do. D1 bills rows, not columns, but a list
  would carry tools it never shows in every response.
- 2026-10-05: The Run page shows the source Template's current tools, not a copy taken when the
  Run started, and only when the viewer may use that Template, with the rule that already decides
  whether the Run names its source Template (`runSourceTemplateUsableSql`). The title and the tools
  come from one `json_object` subquery, so a Run read costs no more rows than before.
- 2026-10-05: Changing the tools adds a version and a snapshot and needs `expected_version`, like
  any content field, but is not a checklist structure change: `content_version` stays, so Runs are
  never staled by it.
- 2026-10-05: MCP `get_template` returns `requiredTools`; `create_template` and `update_template`
  refuse it as an argument (their schemas are strict), so an agent can neither set nor wipe the
  tools, and an update keeps them because the API keeps what a save leaves out. The server version
  goes from 0.3.0 to 0.4.0, as it does whenever what the tools take or return changes.
- 2026-10-05: Links follow the pattern the app already uses for user links in Template content
  (File and Embed blocks): they open in a new tab with `rel="noopener noreferrer"`, after the URL
  is checked again in the browser. Like those, they carry no `ugc` or `nofollow`, on public pages
  too. For the owner to confirm: whether every user-supplied link on public pages, these
  included, should add `ugc` (and `sponsored`, once affiliate links are decided). No affiliate
  tagging is applied (the Clipy referral helper is not used for tools).
- 2026-10-05: The import and export page's "Include public community templates" exports catalog
  rows, which carry no tools, so those templates lose their tools in that export (TD-83).
- 2026-10-05: Two PRs: PR 1 is the data, API, packs and MCP with the client's data plumbing
  (copy and import payloads), so no path drops the tools once the column exists; PR 2 is the UI.
  Between them, the editor's saves leave `requiredTools` out and keep the stored tools.
- 2026-10-05: The shared run page (`/share/:token/`) does not show tools: the owner named the Run
  page, and a guest may not be allowed to see the source Template. Open question for the owner.
- 2026-10-05: The editor keeps the tools in Template Settings, under Tags, rather than a new
  outline entry: they describe the whole Template, like its categories. A save drops tools left
  blank (as it drops blank Sub-tasks) and names a tool by its place in the list, counted before
  the blank ones are dropped. Its rules come from the API's schema; only the wording is the
  editor's.
- 2026-10-05: The list sits before the checklist on the public Template page and Template detail,
  and under the provenance on the Run page as a card like Activity, since a Run needs its tools
  before its first task. Each row shows the link's host, so the destination of a user-supplied
  link is visible before it is opened, and says to screen readers that it opens a new tab.
- 2026-10-05 (TD-83): An export with "Include public community templates" builds those templates
  from the catalog, which carries no tools, so the page reads the chosen templates' tools by id
  (`GET /api/templates/public/required-tools`, at most 50 per request) rather than adding the
  tools to the catalog, which every library page loads without showing tools.
