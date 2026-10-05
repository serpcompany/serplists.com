# Required Tools

- **Status:** active
- **Last updated:** 2026-10-05
- **Goal:** a Template lists the tools a Run of it needs ("Required tools": a name, a link, and
  required or optional), edited in the Template editor and shown on the public Template page,
  Template detail and the Run page, carried by portable packs, exports, imports and MCP
  `get_template` (issue #241). Integrations that act on a Run are a separate, later issue.

## Progress

- [x] PR 1 (`fl/required-tools`): migration `0031` adds `templates.required_tools`; the shared
  schema `src/lib/schemas/requiredTools.ts`; create, save, read by id or slug (public ones to
  anyone), copies (Duplicate's create, clone into Personal or an Organization), delete and
  restore, transfer, version snapshots, portable packs, backups, imports (JSON, Markdown, YAML)
  and the bundled library carry the tools; a Run reads its source Template's tools under the run
  source rule; MCP `get_template` returns them and the MCP server goes to 0.4.0. Tests on the
  migrated tables (`template-required-tools-d1.test.ts`, `template-required-tools-pack-d1.test.ts`,
  `agent-mcp-required-tools.test.ts`) and the pack schema parity cases.
- [ ] PR 2 (`fl/required-tools-ui`, stacked on PR 1): the editor's Required tools fields in
  Template Settings, and the list on the public Template page, Template detail, the Run page and
  the editor preview, with DOM tests and a browser spec.
- [ ] After PR 1 merges into `staging`: the lead applies `0031` to staging
  (`pnpm run verify:staging`, `pnpm run db:migrate:d1:staging`, `pnpm run check:staging:d1-schema`).
  The staging deploy refuses to ship while it is pending. Production waits for the owner.

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
