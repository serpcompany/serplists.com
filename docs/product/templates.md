# Templates

My Templates (`/dashboard/templates`) and a Template's detail page (`/dashboard/templates/:id`):
what its owner, and an Organization's members, can do with a Template. The editor is in
[Template editor](template-editor.md), the public page in [Public Templates](public-templates.md),
Delete and restore in [Delete and the archive](archive.md), and files in
[Import and export](template-import-export.md).

Abbreviations: **List load errors spec** is `tests/e2e/list-load-errors.spec.ts`, **Detail page**
is `tests/unit/views/TemplateDetailPage.test.tsx`, **Detail permissions** is
`tests/unit/features/template-detail/templatePermissions.test.ts`, **Detail actions** is
`tests/unit/views/TemplateDetailPage.actions.test.tsx`, **Duplicate spec** is
`tests/e2e/template-duplicate-in-flight.spec.ts`, **Organization copy** is
`tests/unit/features/template-detail/organizationCopy.test.ts`, **Private copy** is
`tests/unit/features/template-detail/privateTemplateCopy.test.ts`, **Export** is
`tests/unit/features/template-detail/templateExport.test.ts`, **Share** is
`tests/unit/features/template-detail/shareTemplate.test.ts`, **Visibility spec** is
`tests/e2e/template-visibility.spec.ts`, **Visibility** is
`tests/unit/features/template-detail/templateVisibility.test.ts`, **Template saves** is
`tests/unit/functions/api/templates-handler.reconcile.test.ts`, **Conflict refresh spec** is
`tests/e2e/edit-conflict-refresh.spec.ts`, **View public spec** is
`tests/e2e/view-public-template.spec.ts`, **Visibility meta** is
`tests/unit/components/template/TemplateVisibilityMeta.test.tsx`, **Transfer dialog** is
`tests/unit/features/template-detail/useTemplateTransfer.dom.test.tsx`, **Transfer spec** is
`tests/e2e/template-transfer.spec.ts`, **Transfer on D1** is
`tests/integration/template-transfer-local-d1.test.ts`, **Template history** is
`tests/unit/features/template-detail/templateHistoryTimeline.test.ts`, **View all spec** is
`tests/e2e/activity-view-all.spec.ts`, **History API** is
`tests/unit/functions/api/templates-handler.history.test.ts`, and **Activity spec** is
`tests/e2e/template-activity.spec.ts`.

## My Templates

My Templates lists the active context's Templates. When the list fails to load it shows Retry,
never an empty library.

- Check: List load errors spec, "My Templates shows Retry instead of an empty library when the list
  fails to load".

## The detail page

The detail page shows a read-only preview of the Template first: its stats, structure and details.
Editing happens in the editor, and Edit opens it by the Template's id, also on a page opened by
slug.

- Check: Detail page, "renders the v0 private template detail structure with stats, structure, and
  metadata cards" and "links Edit on a page opened by slug to the loaded template id, since the
  editor loads by id only".

The page says a Template was not found only when the API answers 404. A server or network failure
shows "Unable to load" with a Try again button instead.

- Check: Detail page, "offers a retry for a failed load instead of saying the template does not
  exist" and "keeps the not found message for a template that is really missing".

## Who manages a Template

While its Organization is active, an Organization's Template is managed by the viewer's
Organization Role, never by who created it: owners, admins and editors get Share, Edit, Duplicate,
Export, Delete and the visibility switch, and runners and viewers get read-only controls.

- Check: Detail permissions, "follows the viewer's role in the Organization, never who created the
  template".

A Creator demoted to runner loses Edit and Share but keeps Start Run, and a viewer gets no Start
Run, Copy or Edit on a private Organization Template.

- Check: Detail page, "takes Edit and Share away from a creator demoted to runner, but keeps Start
  Run" and "offers an Organization viewer no Start Run, Copy or Edit on a private Organization
  Template".

From any other context an Organization's Template is read-only, even for its Creator. So is a
public Organization Template opened by someone who is no longer an active member (its Creator after
leaving, being removed or disabled, or after the Organization is archived): the API leaves out its
Organization, and the page offers the public copy instead of Duplicate.

- Check: Detail permissions, "keeps an Organization template read-only outside that Organization,
  even for its Creator", "gives the Creator nothing on a public Organization template sent without
  its Organization, as the API sends it once they are no longer an active member" and "offers the
  Creator of a public Organization template the API's public copy, not owner controls".

A Personal Template is managed only by its owner.

- Check: Detail permissions, "lets only the owner manage a Personal template".

## Duplicate and copy

Duplicate names the copy `<title> Copy`. When that would pass the 160-character title limit, the
title is shortened so the copy still fits.

- Check: Detail actions, "TemplateDetail Duplicate" and "keeps the copy of a title near the limit
  within what the API accepts".

While a copy is being made, Duplicate reads "Duplicating..." and is disabled, and choosing it again
(or the copy button) makes no second copy.

- Check: Duplicate spec, "a slow Duplicate cannot be chosen again and makes one copy".

On a public Template, in an Organization, the page offers "Copy to Organization" whatever the
Organization's plan, since the API checks its Template limit
([copying](public-templates.md#copying-a-public-template)). Roles that cannot add Templates to the
Organization do not see it.

- Check: Organization copy, "offers the copy in an Organization whatever its plan says" and "hides
  the copy from Organization roles that cannot add Templates".

In Personal, copying is a Pro feature, so the page checks the Personal plan first and asks a Free
user to upgrade.

- Check: Organization copy, "still asks a Free Personal user to upgrade before copying".

The page offers no copy of a private Template (such as a private Organization Template viewed from
Personal or by a viewer), because the API copies only public ones.

- Check: Private copy, "is hidden in Personal and in an Organization, whatever the plan" and "allows
  public and library templates only".

## Export JSON

Export JSON downloads the Template as a portable template pack, the format Import Templates
accepts, named after its slug (or its id when it has none).

- Check: Export, "builds a portable pack that Import Templates accepts" and "names the file after
  the slug, or the id when the slug is empty".

Like Import Templates, it needs a paid plan in the active ownership context; otherwise the item
reads "Upgrade to export". When the plan check failed, it reads Export JSON and checks the plan
again on click.

- Check: Export, "downloads the pack only on a paid plan", "asks a Free plan to upgrade instead of
  downloading", "labels the menu item for the plan" and "asks for a retry, never an upgrade, when
  the plan check failed".

A Template the pack format cannot hold (for example one with no tasks) is not downloaded: the page
shows an error naming the reason.

- Check: Detail actions, "shows the reason instead of a success message".

## Share and visibility

Share makes a private Template public only after its public URL resolves. An owner without a
username is asked to set one, and an Organization without a slug gets "This Organization needs a
slug before its templates can be shared. Its owners and admins can set one in its settings."; the
Template stays private.

- Check: Share, "leaves a private template private when the owner has no username" and "leaves an
  Organization Template private while its Organization has no slug, and says so".

Share always sends the loaded version to the server, even when the page already shows the Template
as public, and builds the link from the slug the server returns and the Template Owner's current
handle. Share links for an Organization's Templates use the Organization's handle.

- Check: Share, "asks the server to confirm a template the loaded copy shows as public, which
  stores nothing when it is still public", "builds the link from the slug the server returns" and
  "builds an Organization Template's link from its Organization's handle, without asking for its
  Creator's username".

A Template made private, deleted, or given a new slug elsewhere gets a conflict: the page reloads
it and gives no link.

- Check: Share, "gives no link when a public copy went private or was re-slugged elsewhere" and
  "gives no link when a public copy was archived elsewhere".

The Public/Private switch sends only the visibility flag, with the loaded version.

- Check: Visibility, "sends only the visibility flag with the loaded version, and applies the new
  visibility".

The badge and the switch always show what the server holds after Share or the switch, and neither
can start while the other is saving.

- Check: Visibility spec, "shows Public after Share follows a switch to Private, and accepts the
  next change".

A visibility change adds a version but never changes the checklist content version, so it never
reconciles or stales Runs.

- Check: Template saves, "versions a visibility change, so a stale editor gets a conflict, without
  touching content or runs".

After an edit conflict, the switch reloads the Template before it re-enables, so the next click
sends the current version.

- Check: Conflict refresh spec, "the visibility switch recovers from an edit conflict without a
  reload".

Share does the same.

- Check: Share, "reloads the stored template after an edit conflict so a retry can succeed".

A public Template's detail page links to its live public page ("View public template", beside the
Public badge), built by the same resolver as Share, so an Organization's public Template links to
its Organization's URL.

- Check: View public spec, "a public Template's page links to its live public page, which opens it"
  and "the link sits beside the Public badge and fits the screen".

A public Template whose owner has no handle says its public page is unavailable instead of
guessing a link ("Public page unavailable until its creator sets a username", or "Public page
unavailable until its Organization has a slug").

- Check: Visibility meta, "says the public page is unavailable, rather than guessing a link, when
  its creator has no username" and "says an Organization's public page is unavailable while the
  Organization has no slug, rather than using its creator's".

## Transfer to Organization

A Personal Template's owner can move it into an Organization with "Transfer to Organization" in
"Template actions", offered when they are an active owner, admin or editor of at least one
Organization. The dialog lists those Organizations.

- Check: Transfer dialog, "is offered only for your own Personal Template, and only when some
  Organization can take it" and "offers only active Organizations where the user can add
  Templates".

The dialog says that Runs already started from the Template stay in Personal and no longer receive
its changes. The page then opens the Template at its Organization's URL ("Template transferred to
`<Organization>`"), and the dialog fits a phone.

- Check: Transfer spec, "Transfer to Organization moves a private Personal Template into the chosen
  Organization and opens it there" and "the transfer dialog fits a phone".

The Template keeps its id, content, visibility and history, its Personal Runs stay where they
were, and both libraries refresh.

- Check: Transfer on D1, "moves the Template in place to the Organization, keeping its id, creator
  and content version, with one audit event and version", "leaves the Template's existing Personal
  runs where they were" and "lists the transferred Template in the Organization for its members,
  and no longer in Personal".

A public Template moves too: the dialog says first that its public page becomes the
Organization's, and its old link redirects there.

- Check: Transfer spec, "a public Personal Template transfers too, after the dialog says its public
  page moves and its current link redirects".

A public Template can move only to an Organization with a slug, so it keeps a public URL.

- Check: Transfer on D1, "moves a public Template too, still public under the Organization, but
  only to an Organization with a slug, so it keeps a public URL".

An Organization at its Template limit, or a Template changed meanwhile, keeps the dialog open with
the reason.

- Check: Transfer dialog, "keeps the dialog open with the reason when the transfer is refused, so
  the user can pick another Organization".

## Activity

Template history is stored in `template_versions`, and related actor and action history in
`audit_events`. The detail page's Activity shows both as one list, newest first: every version,
plus the changes that create no version, such as Delete, restore, and making a Template public or
private.

- Check: Template history, "shows archive, restore and visibility changes between versions, newest
  first".

It shows the latest 8 entries, and "View all activity" loads the latest 100.

- Check: View all spec, "a Template's Activity shows its latest 8 entries, and View all activity
  shows the rest".

A version and the audit event recorded with it appear once: `GET /api/templates/:id/history` gives
each version the `metadata` of that event, the field run history events carry, so an entry names
who made the change the way the run Activity does.

- Check: History API, "returns template history to active team members, each version with the
  metadata of its audit event, and the events with them" and "gives each version the metadata of
  the audit event its write recorded, naming a Run Key, and null to one older than the newest
  events read".

The Activity refreshes after any Template change, without a reload.

- Check: Activity spec, "Activity shows Share without a reload, and archive and restore next to
  versions".

A save that changes nothing adds no version.

- Check: Template saves, "accepts a save with no changes without writing anything".
