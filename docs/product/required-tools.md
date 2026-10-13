# Required tools

The tools a Run of a Template needs (#241): how a Template lists them, where they show, and how
they travel with it to agents and files.

Abbreviations: **Required tools spec** is `tests/e2e/required-tools.spec.ts`, **Tools API** is
`tests/unit/functions/api/template-required-tools-d1.test.ts`, **Tools schema** is
`tests/unit/lib/schemas/requiredTools.test.ts`, **Tools on runs and packs** is
`tests/unit/functions/api/template-required-tools-pack-d1.test.ts`, **Public tools read** is
`tests/unit/functions/api/template-public-required-tools-d1.test.ts`, **Tools editor** is
`tests/unit/components/template-editor/RequiredToolsEditor.dom.test.tsx`, **Tools save** is
`tests/unit/lib/forms/templateEditorRequiredTools.test.ts`, **Editor preview** is
`tests/unit/components/template-editor/TemplatePreviewDialog.dom.test.tsx`, **Tools list** is
`tests/unit/components/template/RequiredToolsList.dom.test.tsx`, **Run page tools** is
`tests/unit/views/ChecklistRunPage.requiredTools.test.tsx`, **App copies** is
`tests/unit/lib/templates/requiredToolsPortable.test.ts`, and **MCP tools** is
`tests/unit/functions/api/agent-mcp-required-tools.test.ts`.

## On a Template

A Template can list its Required tools: each has a name, a link, and whether it is required or
optional. They are stored in `templates.required_tools` (migration `0031`), and the API returns
them on a Template's own reads, by id or slug: to its owner, and to anyone once the Template is
public. A Template without tools reads as an empty list.

- Check: Tools API, "stores the tools a create sends and returns them on the Template's own reads:
  to its owner, and to anyone once it is public" and "answers an empty list for a Template without
  tools, and stores nothing for it".

One schema checks them, shared by the API, the app and the portable format
(`src/lib/schemas/requiredTools.ts`): at most 20 tools, a name that is not blank and at most 80
characters, and an `http://` or `https://` link of at most 2048 characters with no spaces. A tool
without a `required` flag reads as required.

- Check: Tools schema, "accepts tools with a name, a web URL in any letter case, and a required
  flag", "refuses a tool with no name or a blank one" and "reads a tool without a required flag as
  required, and drops keys a tool does not have".

The API refuses a tool it cannot store and names the field, so nothing unsafe is ever linked.

- Check: Tools API, "refuses a tool it cannot store and names the field, so nothing unsafe is ever
  linked".

Lists never carry them: the API leaves them out of every list of Templates.

- Check: Tools API, "leaves the tools out of every list, which reads no more than it shows".

A save that leaves them out keeps them, a save that sends an empty list clears them, and only
someone who may edit the Template can change them. A save that changes them adds a version whose
snapshot holds them, but no checklist structure change, so Runs are never staled by it.

- Check: Tools API, "keeps the tools through a save that leaves them out, as the editor's saves
  before #241 and every MCP update do", "clears the tools when a save sends an empty list", "lets
  only someone who may edit the Template change its tools" and "saves changed tools as a new version
  whose snapshot holds them, without a structure change that would stale Runs".

They stay with the Template through delete and restore and through Transfer to Organization, and
Save and Copy to Organization copy them with a public Template.

- Check: Tools API, "copies the tools with a public Template into Personal and into an
  Organization" and "keeps the tools when a Template is deleted and restored, or transferred to an
  Organization".

Duplicate copies them, and so does saving a library Template to an account.

- Check: App copies, "copies them with a Duplicate and with a library Template saved to an account".

Links are stored and exported exactly as written: nothing adds affiliate tags or rewrites them.

- Check: Tools on runs and packs, "stores and exports each link exactly as written, adding no tag
  and rewriting nothing".

## In the editor

The Template editor edits them in Template Settings. "Add tool" adds a card with the tool's "Name",
"URL" and a "Required" switch (on for a new tool), "Remove tool N" removes one, and "Add tool"
stops at 20 ("A template can list up to 20 tools.").

- Check: Tools editor, "adds a tool, names it and links it, required unless switched off, and
  marks the form as changed", "shows the stored tools, and removes the one whose button is pressed"
  and "stops adding at 20 tools and says why".

A save drops tools left blank and trims the rest. Before sending anything, it refuses a tool
without a name or with a URL that is not an `http://` or `https://` address, naming the tool by
its place ("Required tools: give tool 2 a name.", "Required tools: tool 1's URL must start with
http:// or https:// and have no spaces.").

- Check: Tools save, "drops tools left blank and trims the rest", "names the tool by its place in
  the list when its name or URL cannot be saved" and "refuses a save with a tool it cannot store,
  before the request".

The editor's Preview lists the draft's tools that have a name.

- Check: Editor preview, "lists the draft tools that have a name, trimmed, under the draft title".

## Where they show

The public Template page, Template detail and the Run page list them under "Required tools",
before the checklist. Each tool's name links to its site in a new tab
(`rel="noopener noreferrer"`), with the site's host and a "Required" or "Optional" badge.

- Check: Required tools spec, "the owner lists Required tools in the editor, and Template detail,
  the public Template page and the Run page link them".

A Template without tools shows no list, and a stored link that is not a web address shows as the
tool's name alone, never as a link.

- Check: Tools list, "takes the heading level of where it sits, and renders nothing without tools"
  and "shows a tool whose stored link is not a web address as its name alone, never as a link".

A Run reads its source Template's tools, with that Template's title, only when the viewer may use
that Template (the [run source rule](run-template-updates.md#the-run-source-rule)); otherwise it
gets none. A Run of a deleted Template gets none.

- Check: Tools on runs and packs, "shows the tools of the viewer's own Template and of a public
  one", "hides the tools of a source Template the viewer may not see, as it hides its title" and
  "stops showing them once the source Template is deleted".

The Run page shows those tools; the shared run page never shows any.

- Check: Run page tools, "lists them in a card, each linking to its site in a new tab and marked
  Required or Optional", "shows nothing when the source Template has no tools or the viewer may not
  see it" and "leaves them off the shared run page".

Every list and the editor's fields fit a 390px phone (one column below `sm`).

- Check: Required tools spec, "on a phone the Required tools fields fit the screen, and a save
  names the tool whose URL is not a web address".

## For agents and in files

A Run Key's `get_template` returns a Template's tools (`requiredTools`). `create_template` and
`update_template` do not take them (`invalid_arguments`), so a key creates Templates without tools,
and its updates always keep the tools a Template has ([Run Keys](run-keys.md)).

- Check: MCP tools, "returns requiredTools with the template from get_template", "refuses
  requiredTools as an argument of update_template and create_template, so an agent cannot change or
  wipe them", "creates a template with no tools" and "keeps them through update_template, whether
  it replaces fields or runs an operation".

Portable packs and backups carry them
([portable templates](portable-templates.md#required-tools)): an export writes them only for a
Template that has tools, an import stores them, and a Template whose tools cannot be stored fails
on its own while the rest of the file imports.

- Check: Tools on runs and packs, "exports a Template's tools in the portable pack and the backup,
  and no empty list for a Template without them", "imports the tools a pack holds, and refuses only
  the Template whose tools it cannot store" and "imports the tools of a backup export, which
  round-trips them".

An export that adds public community Templates reads their tools from
`GET /api/templates/public/required-tools?ids=...`, which answers anyone with the tools of each
public Template asked for, at most 50 per request, and leaves out a private, deleted or unknown
one ([import and export](template-import-export.md)).

- Check: Public tools read, "answers anyone with the tools of each public Template asked for, and
  nothing for one without tools" and "leaves out a private, deleted or unknown Template, so it
  reveals nothing a public read would not".
