# Import and export

The Import/Export page (`/dashboard/import-templates`) and exporting a context's Templates from it
(`GET /api/templates/backup`). Importing a file is in [Importing Templates](template-import.md),
the pack format in [Portable templates](portable-templates.md), and Export JSON for one Template in
[Templates](templates.md#export-json).

Abbreviations: **Import/Export page** is `tests/unit/views/TemplateImportExportPage.test.tsx`,
**Backup page** is `tests/unit/components/TemplateBackup.test.tsx`, **Backup API** is
`tests/unit/functions/api/templates-handler.backup.test.ts`, **Export pack** is
`tests/unit/features/template-backup/exportTemplatePack.test.ts`, **Export spec** is
`tests/e2e/template-export.spec.ts`, **Portable export API** is
`tests/unit/functions/api/templates-portable-handler.export.test.ts`, **Backup export** is
`tests/unit/lib/utils/templateBackup.export.test.ts`, **Portable export** is
`tests/unit/lib/templates/portableExport.test.ts`, and **Import summary** is
`tests/unit/lib/templates/templateImportSummary.test.ts`.

## The page

Import and export have their own dashboard section, in Personal and in each Organization.

- Check: Import/Export page, "renders import and export as a dedicated dashboard section".

Template import and export are a Pro feature: they need a paid plan in the active ownership
context. The page derives access from the signed-in plan: `billingEnabled` controls only whether
checkout can start, and never disables the file picker for a User who already has import access,
so an entitled User needs no direct API workaround. A failed plan check is not read as Free.

- Check: Backup page, "enables import and export for a known Pro plan", "still shows the upgrade
  banner when the plan is known to be Free" and "does not treat a failed billing-status request as
  the Free plan".

The API refuses an export or import on a Free plan.

- Check: Backup API, "should reject template backup export for free users".

Export and import wait until the active context's Template list has loaded, because until then a
stored Organization can still read as Personal; the counts show a dash meanwhile.

- Check: Backup page, "shows no counts and keeps export and import off until the list has loaded"
  and "shows the counts and enables export once the list has loaded".

When the Template list fails to load, the page shows the load error with Retry instead of zero
counts, and export still works.

- Check: Backup page, "says the list failed and offers Retry instead of zero counts that read as a
  context with no templates" and "keeps Export enabled, since the server's pack decides what the
  context owns".

## Exporting

`GET /api/templates/backup` exports the active context's own Templates (Personal or the
Organization) as a portable pack by default.

- Check: Portable export API, "exports portable template packs by default" and "exports portable
  template packs for paid team workspaces".

The server alone decides whether there is anything to export: an empty pack reports "No templates
available to export" and downloads nothing, so a list request that failed and looks empty never
blocks an export.

- Check: Export pack, "asks the server for the context's own templates even when the loaded list
  looks empty, as a failed list request also does" and "reports nothing to export without
  downloading when the server returns no templates".

Only one export runs at a time: while it runs, the button reads "Exporting..." and it and the
include-public switch are disabled.

- Check: Backup page, "disables Export and the include-public switch and says it is exporting" and
  "enables Export again once the export has finished".

Further clicks are ignored, so a double click sends one request and downloads one file.

- Check: Export spec, "a double click on Export Portable Pack runs one export and downloads one
  file".

"Include public community templates" adds, in the browser, the public Templates from the catalog
that the context does not own (never the bundled library), and recomputes the manifest for the
whole pack with the same `buildPortablePackManifest` the API uses
(`src/lib/schemas/portableTemplatePack.ts`).

- Check: Portable export, "never adds the bundled library or a private template" and "appends the
  public templates to the owned pack with one manifest for both".

The page fetches the catalog only for such an export, never when it opens, and reuses a copy the
library pages loaded in the last 5 minutes (`usePublicCatalogLoader`).

- Check: Backup page, "loads only the active context list, never the public catalog".

Catalog rows carry no Organization id, so a catalog Template counts as owned when its id is in the
page's Template list or its slug is in the pack the server returned (slugs are unique). The
server's pack decides, so a list that failed to load or is older than the catalog never writes a
Template twice, and a Template both the server and the browser skipped is listed once in
`manifest.skippedTemplates`.

- Check: Portable export, "in Personal, leaves out the user's own Personal templates, which the
  server already exported", "in an Organization, leaves out templates whose slug the server already
  exported, which the page's own list can miss" and "lists a template the server skipped once when
  its catalog copy is skipped again".

Catalog rows carry no Required tools (the lists do not read them), so the page then reads the
chosen public Templates' tools by id (`GET /api/templates/public/required-tools?ids=...`, at most
50 Templates per request, one request after another) and exports each with its tools, as the
context's own Templates are. If that read fails, the export fails and nothing is downloaded.

- Check: Export pack, "exports each one with the tools the API reads for it by id, and none for one
  without tools", "reads the tools of at most 50 templates per request" and "downloads nothing when
  the tools cannot be read, rather than a pack without them".

A Template the pack format cannot hold is left out of the pack; the page then shows a warning that
names each left-out Template and its reason instead of the success message, or an error with no
download when nothing could be exported.

- Check: Import summary, "warns and names each left-out template with its reason, so the backup is
  not silently incomplete" and "is an error when nothing could be exported".

Backup export (`?format=backup`) remains for compatibility and restore-style workflows: an object
with `version`, `exportedAt`, an optional `exportedBy`, the context's `templates` as app rows, and
optional `metadata` (`totalTemplates`, `publicTemplates`, `privateTemplates`).

- Check: Backup API, "should export backup format for pro users when requested".

Importing a backup keeps each Template's content, categories and tags.

- Check: Backup export, "keeps the content, categories and tags of each Template".
