# Authoring templates as files

Writing a Template as a file to import: the YAML-first workflow, the strict Markdown format, the
previews generated from a source, and copy-paste examples. What an import accepts is in
[Importing Templates](template-import.md), and the pack format in
[Portable templates](portable-templates.md).

Abbreviations: **Example assets** is `tests/unit/scripts/templateExampleAssets.test.ts`,
**Template lint** is `tests/unit/scripts/templateLint.test.ts`, **Lint round trip** is
`tests/unit/scripts/templateLint.roundtrip.test.ts`, **Form lint** is
`tests/unit/scripts/templateFormLint.test.ts`, **Markdown format** is
`tests/unit/lib/templates/templateMarkdown.test.ts`, **Markdown body** is
`tests/unit/lib/templates/templateMarkdownBody.test.ts`, **Markdown round trip** is
`tests/unit/lib/templates/templateMarkdown.roundtrip.test.ts`, **Form blocks** is
`tests/unit/lib/templates/templateForms.portable.test.ts`, **App copies** is
`tests/unit/lib/templates/requiredToolsPortable.test.ts`, **Readme** is
`tests/unit/scripts/templateReadme.test.ts`, and **Preview html** is
`tests/unit/scripts/templatePreviewHtml.test.ts`.

## The YAML-first workflow

For people writing Templates by hand, the recommended workflow is YAML-first:

1. Create or edit `template.yaml`.
2. Generate `template.json`, `README.md`, `preview.html` and, optionally, `template.md` from it
   with `pnpm run templates:generate path/to/template.yaml`.
3. Run `pnpm run templates:check` to verify the generated files are in sync.
4. Import the generated `template.json`, or the original `template.yaml`, through Template import.
5. Check the imported Template on the public site.

This has been verified end to end against the real site for the official `serp` publisher account.

- Check: Example assets, "keeps the minimal example assets valid and synced" and "keeps the full
  example assets valid and synced".

`template.yaml` is the source a person writes; `template.json` is the generated normalized machine
file, `README.md` the generated readable checklist preview, `preview.html` the generated richer
card-style preview, and `template.md` an optional generated strict Markdown file. Generated files
are never edited by hand: regenerate them from `template.yaml`, and `pnpm run templates:check`
reports any drift between the source and what it generates.

- Check: Template lint, "flags drift between yaml source and generated readme/html artifacts" and
  "flags drift between sibling json and markdown templates".

A suggested untracked local folder for one Template (the folder name is only an example, and is
never linked from tracked docs):

```text
tmp/local-templates/{template-slug}/
  template.yaml
  template.json
  template.md
  README.md
  preview.html
```

## Examples

Copy-paste examples live in `portable-templates/examples/`, the intended starting point:
`minimal/` is the smallest valid Template, and `full/` adds metadata, rules, Required tools and
every content type. In each, edit `template.yaml`; `template.json`, `template.md`, `README.md` and
`preview.html` are generated from it and must pass `pnpm run templates:check`.

- [minimal/template.yaml](portable-templates/examples/minimal/template.yaml),
  [template.json](portable-templates/examples/minimal/template.json),
  [template.md](portable-templates/examples/minimal/template.md),
  [README.md](portable-templates/examples/minimal/README.md),
  [preview.html](portable-templates/examples/minimal/preview.html)
- [full/template.yaml](portable-templates/examples/full/template.yaml),
  [template.json](portable-templates/examples/full/template.json),
  [template.md](portable-templates/examples/full/template.md),
  [README.md](portable-templates/examples/full/README.md),
  [preview.html](portable-templates/examples/full/preview.html)

The standalone YAML source stays valid too.

- Check: Example assets, "keeps standalone yaml example source valid".

Payloads tested against the live site:
[camping-checklist.json](portable-templates/camping-checklist.json),
[wedding-checklist.json](portable-templates/wedding-checklist.json) and
[comprehensive-template-demo.json](portable-templates/comprehensive-template-demo.json).

## Strict Markdown format

The strict Markdown dialect is still supported for compatibility and lintable round trips, but it
is no longer the recommended primary authoring format. YAML frontmatter is required and must
include at least `title`, and the `#` heading must match the frontmatter `title`.

- Check: Markdown format, "renders markdown and parses it back to the same normalized template"
  and "rejects markdown title/frontmatter mismatches".

`##` headings define sections and `###` headings define items; an item's description can appear
between its `###` heading and its first fenced block. Everything between the `#` heading and the
first `##` heading, fenced blocks included, is the Template description. Text or blocks between a
`##` heading and its first `###` item have no place in the format and are dropped on import.

- Check: Markdown body, "keeps a content block before the first section in the template
  description" and "drops text and blocks between a section heading and its first item, which the
  format has no place for".

Structured content uses fenced blocks: `serplists:text`, `serplists:image`, `serplists:video`,
`serplists:file`, `serplists:embed`, `serplists:subItems` and `serplists:form`. A `subItems` block
holds a YAML array. The frontmatter keeps the Template's Required tools.

- Check: App copies, "keeps them through the Markdown and YAML template formats".

A `form` block holds a YAML array of fields, each an object with `label` and `kind` and, as its
kind allows, `required`, `description`, `options` (a list of labels, or of objects with a
`label`), `min` and `max`. Export writes `required: true` only for a required field and options as
their labels; this form keeps no ids, so import gives fields and options new ones.

- Check: Form blocks, "renders as a fenced serplists:form YAML block and imports back as the same
  template" and "reads options given as objects with a label, and refuses a form block that is not
  a list of fields".

`text` and `embed` values may themselves contain headings and code fences. A block's fence is
longer than any run of backticks that starts a line of its value (four backticks around a value
with a 3-backtick code fence), and a block closes only on a line with exactly its opening number
of backticks. Plain values keep 3-backtick fences, and headings are recognized only outside
blocks.

- Check: Markdown round trip, "keeps an embed block that contains a fence", "renders plain content
  with the same 3-backtick fences as before" and "still parses a hand-written file with plain
  3-backtick fences".

A description line that would read as a `##` or `###` heading or a `serplists:` fence is written
with one extra leading backslash (`\## Notes`), and import removes it.

- Check: Markdown round trip, "keeps an item description with heading-like and fence-like lines"
  and "keeps a template description with an item heading line".

`pnpm run templates:check` also parses each Template's generated Markdown back and reports
`markdown-roundtrip` when it would not import as the same Template.

- Check: Lint round trip, "reports a template whose generated Markdown would not import back" and
  "reports generated Markdown that imports as a different template".

## Generated previews

`README.md` is the readable checklist-style preview, for readability rather than perfect fidelity
to the app.

- Check: Readme, "renders a readable markdown preview document".

`preview.html` is the richer preview of image, video, file and embed cards, close to the app's
content cards without depending on the app. As in the app, an embed links to its URL or to the
`src` of pasted iframe code, and any other code shows as text.

- Check: Preview html, "renders an html preview with card-like media blocks" and "links an embed to
  its URL or iframe src in the html preview, as the app does, and shows other code as text".

`README.md` lists each field of a form with its kind, whether it is required, its help text and its
options.

- Check: Readme, "lists the fields of a form block with their kind, required mark, help text and
  options".

`preview.html` lists a form's fields the same way.

- Check: Preview html, "renders a form as its fields, with each kind, required mark, help text and
  options, never as an embed".

Both list the Template's Required tools, as the full example shows.

- Check: Example assets, "keeps the full example assets valid and synced".

`pnpm run templates:check` also reports an empty form (`empty-form`), a blank field label
(`blank-form-field-label`), and a dropdown or multiple choice field without options
(`form-field-without-options`).

- Check: Form lint, "flags an empty form, a blank label and a choice field without options".
