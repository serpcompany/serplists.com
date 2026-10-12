# Template editor

The Template editor: `/dashboard/templates/new` creates a Template, and
`/dashboard/templates/:id/edit` edits one. Its Required tools are in
[Required tools](required-tools.md).

Abbreviations: **Editor access** is `tests/unit/views/TemplateEditor.permissions.test.tsx`,
**Edit permission** is `tests/unit/features/template-editor/useTemplateEditPermission.test.ts`,
**Editor outline spec** is `tests/e2e/template-editor-outline.spec.ts`, **Editor saves** is
`tests/unit/features/template-editor/useTemplateEditorModel.save.test.ts`, **Stale editor spec**
is `tests/e2e/template-stale-editor.spec.ts`, **Kept work spec** is
`tests/e2e/session-end-kept-work.spec.ts`, **Editor blocks spec** is
`tests/e2e/template-editor-blocks.spec.ts`, **Block reorder** is
`tests/unit/components/template-editor/ContentEditor.reorder.test.tsx`, **Editor phone spec** is
`tests/e2e/template-editor-phone.spec.ts`, **Form editor** is
`tests/unit/components/template-editor/FormFieldsEditor.dom.test.tsx`, **Form save** is
`tests/unit/hooks/useTemplateValidation.forms.test.ts`, **Form display** is
`tests/unit/components/ContentRenderer.forms.test.tsx`, **Forms spec** is
`tests/e2e/template-forms.spec.ts`, **Slug rule** is `tests/unit/lib/utils/slug.test.ts`,
**Template slugs** is `tests/unit/functions/api/templates-handler.slugs.test.ts`,
**Template bounds** is `tests/unit/functions/api/templates-handler.bounds.test.ts`, **SEO preview**
is `tests/unit/lib/templates/templateSeoPreview.test.ts`, **SEO panel** is
`tests/unit/components/TemplateFormPanels.test.tsx`, and **Editor metadata spec** is
`tests/e2e/template-editor-metadata.spec.ts`.

## Who gets the form

The editor opens its form only for someone the API lets save the Template: for an Organization's
Template, an owner, admin or editor of that Organization (an edit link for a private one opens at
its Organization's URL), and for a Personal Template, its owner.

- Check: Editor access, "opens the form for an Organization editor in the Organization", "opens
  the form for the owner of a Personal template" and "shows neither the notice nor the form at a
  Personal URL for a private Organization Template, which moves to the Organization's URL".

Anyone else who opens an edit link (a runner or viewer, or someone opening another user's public
Template) sees a read-only notice with a link to the Template, and `/dashboard/templates/new`
shows the same kind of notice to a role that cannot add Templates to the active Organization.

- Check: Editor access, "shows an Organization viewer a read-only notice instead of the form,
  linked inside the Organization", "shows the notice for another user's public template" and "shows
  the notice on the new-template route to a role that cannot create templates".

The editor waits for the user's Organizations to load before deciding.

- Check: Editor access, "waits for the viewer's Organizations before showing either".

A form that has opened stays open when a later refresh shows a lower role; the save still refuses
what the role no longer allows.

- Check: Edit permission, "keeps an open form open when a later teams refetch shows a lower role,
  since closing it would drop unsaved edits without a prompt".

## Loading and saving

The editor loads the Template by id when it opens, never from the cached Template lists.

- Check: Editor outline spec, "opens the latest saved template, not the cached list copy".

Each save checks against the version the editor loaded, then the version its last save returned,
and resends visibility only when its own switch changed.

- Check: Editor saves, "sends the loaded version, and leaves visibility out unless the editor
  changed it" and "moves the baseline to what was saved".

So a background list refresh cannot hide another editor's save: an editor opened before a Share
cannot make the Template private again.

- Check: Stale editor spec, "an editor opened before a Share cannot make the template private
  again, even after its template list refetches on focus".

A save made on an older version gets `409 edit_conflict` instead of overwriting newer work. The
editor keeps the user's draft and offers "Load latest version".

- Check: Kept work spec, "restored edits to a template saved elsewhere meanwhile get the edit
  conflict instead of overwriting it".

Loading the latest version replaces unsaved changes only once the user confirms.

- No automated check yet.

## Reordering

In the outline, sections and tasks reorder by dragging their handle, or with the Up and Down arrow
keys on the focused handle, which keeps focus. A dragged task moves only within its section.

- Check: Editor outline spec, "reorders sections and tasks with the visible drag handles" and
  "shows outline actions on keyboard focus, and reorders with the arrow keys keeping focus on the
  moved handle".

A task's content blocks reorder the same way, by keyboard or by drag, and a save stores the new
order, which runs and public pages show.

- Check: Editor blocks spec, "reorders content blocks by keyboard and by drag and saves the order".

Blocks keep their ids when they move.

- Check: Block reorder, "moves a block up with the arrow key and keeps its id".

On a touch screen, where dragging does not work, each shows Move up and Move down buttons instead
of the handle.

- Check: Editor phone spec, "at 390px a touch screen reorders content blocks with their Move
  buttons".

## On a phone

Below the `lg` width the editor is one column, and its outline (Template Settings, Search & SEO,
the sections and tasks) opens in a sheet from the Outline button in its top bar. The sheet closes
on the entry picked or added.

- Check: Editor phone spec, "at 390px the outline opens in a sheet, closes on the entry picked, and
  stays open while a section moves".

## Forms

A task can hold a Form (Add Block → Form): fields the Template defines and every Run fills in. A
field has a label, a type (Short text, Long text, URL, Email, Number, Date, Dropdown, Multiple
choice, Checkbox or File), a Required switch, optional help text, options for Dropdown and
Multiple choice, and a minimum and maximum for Number.

- Check: Form editor, "adds a Form from Add Block, starting with one short text field that is not
  required", "names a field, gives it help text, makes it required, and adds a second one", "gives
  a dropdown an options list to add, rename and remove options, and drops the options when it
  becomes short text again" and "offers a minimum and a maximum for a number, and clears them for
  another type".

Fields can be added (up to 50), removed (never the last one) and moved up or down, each keeping
its id.

- Check: Form editor, "moves a field up and down and removes one, keeping each field id".

Saving drops fields without a label, blank options, a Dropdown or Multiple choice field left with
no option, and a Form left with no field.

- Check: Form save, "drops fields without a label and trims the rest, keeping each field's id",
  "drops blank options, and a dropdown or multiple choice field left with none, since no one could
  answer it" and "drops a Form block left with no fields, and keeps the blocks around it".

The public Template page, Template detail and the editor's preview list the fields read-only, with
their type, a "Required" badge, help text and options.

- Check: Form display, "lists each field with its label, type, Required mark, help text and
  options, and offers no input" and "shows the same list in the editor preview, under the task".

The Form editor fits a 390px phone.

- Check: Forms spec, "the form editor and a run's form inputs fit the screen".

## Field limits, slugs and Search & SEO

Every save holds a Template's fields to the same bounds (`src/lib/schemas/templateLimits.ts`): a
title that is not blank and at most 160 characters, a description of 5000, `seoTitle` 160,
`seoDescription` 320, at most 20 categories and 20 tags of 80 characters each, rules with a
non-empty `id`, `type` and `path`, and the [Required tools](required-tools.md) limits. The editor
names a field over its limit without sending the save.

- Check: Editor saves, "names the field and skips the API when a value is over its limit".

The API checks bounds only for fields whose value changes, so a row that predates these bounds, or
a legacy slug with punctuation, can still be saved and its visibility switched. A changed value over
its bound is refused, naming the field.

- Check: Template bounds, "accepts a save that resends a legacy slug and stored values that
  predate the bounds" and "rejects a changed value over its bound and names the field".

Template and Organization slugs come from one rule (`src/lib/utils/slug.ts`, used by the page, the
editor's URL Slug field, and the API): accented letters fold to their base letter (`Café` becomes
`cafe`, `Straße` becomes `strasse`), other characters are dropped, and a title with no Latin
letters or digits falls back to `template` (or `team-<id>` for an Organization).

- Check: Slug rule, "one slug rule for templates, Organizations, and categories".

The URL Slug field (`seoUrl` in the form) shows the stored `slug`. A new or changed slug is stored
as lowercase letters, numbers and hyphens, at most 160 characters: typed accents fold, and a typed
slug with nothing left after that is a `400` naming `slug`. A save that echoes the stored slug
unchanged is accepted even when that slug predates the rule (the legacy backfills in migrations
0002 and 0005), and an unrelated save never rewrites it.

- Check: Template slugs, "folds the letters of a custom slug typed with accents", "rejects a
  custom slug with no letters it can use instead of silently keeping the old one", "saves a
  template whose stored legacy slug is echoed back unchanged" and "keeps and returns the stored slug
  when a title edit requests none, so shared links keep working".

`GET /api/templates/slug/:slug` percent-decodes the slug before looking it up.

- Check: Template slugs, "decodes percent-encoded slugs before looking them up".

The Search & SEO panel previews the public URL. The handle is the Template Owner's (for a new
Template, the signed-in user's username in Personal or the active Organization's slug), and the
slug is the one a save stores: a blank slug keeps the saved one, or for a new Template comes from
its name.

- Check: SEO preview, "uses the handle a new template is created under: the signed-in user's, or
  the active Organization's", "uses a loaded template's Template Owner, not the person editing it,
  so a member editing an Organization's template sees the Organization's URL", "builds a new
  template slug from its name, as the server does" and "keeps the stored slug of an existing
  template when the field is cleared, as the API does when no slug is sent".

The preview says when the owner has no username, or the Organization no slug ("No public URL yet:
the Organization needs a slug, which its owners and admins can set in its settings."), and notes
that a slug another Template already uses gets a short suffix.

- Check: SEO preview, "says a username is needed instead of making up a path" and "notes a
  possible suffix only when the save sends a slug".

It also says when the Template is private, so its page is not live.

- Check: SEO panel, "says a private template has no live public page".

Search Title and Search Description save with the Template (`templates.seo_title`,
`templates.seo_description`), and tags and categories save with it too.

- Check: Editor metadata spec, "saves SEO fields and reloads them in the editor" and "adds tags and
  categories before save and persists them".
