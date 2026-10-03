# Template Editor and Detail Page

The template editor creates a Template (`/dashboard/templates/new/`) and edits one
(`/dashboard/templates/<id>/edit/`). What it offers users is in
[features](../product-specs/features.md#templates). The form's contract (its values, how stored
content is coerced, slugs, the defaults a save applies, and the plan-limit notices and kept
drafts as users see them) is in [FRONTEND.md](../FRONTEND.md#template-editor-forms), the leave
guard every page uses is in [unsaved changes](../FRONTEND.md#unsaved-changes), and how a save
refreshes what the app has cached is in [client data](client-data.md#refreshing-after-a-write).
This page is how the editor's models in `src/features/template-editor/` work, and why. The
[last section](#the-template-detail-page) covers the pages that show one template
(`src/features/template-detail/`), whose Share and visibility switch save versions too.

## Where it lives

| Module (`src/features/template-editor/`) | Holds |
| --- | --- |
| `useTemplateEditorModel.ts` | Loading the template, the version and visibility a save sends, saving, and loading again after a conflict |
| `postSaveFormState.ts` | The click-time copy a save sends, and rebasing the form onto what was stored |
| `useTemplateEditPermission.ts`, `templateEditPermission.ts` | Whether the form opens, or a read-only notice shows instead |
| `useTemplateEditorAccess.ts`, `templateEditorAccess.ts` | Plan limits, save notices with their action (checkout or sign-in), and the kept draft |
| `templateDraftStore.ts`, `useOtherContextTemplateDraft.ts` | Drafts kept in session storage, and a new template's draft kept in another context |
| `navigationGuards.ts`, `useTemplateEditorLeaveGuard.ts` | When leaving asks and with which question, and the questions before the whole form is replaced |
| `pendingUploads.ts` | Uploads that have not finished |
| `saveForVisit.ts` | What a save still does after the user left the editor |
| `clipyDraft.ts` | Generating a draft from Clipy |

The page is `src/views/TemplateEditor.tsx`, rendered by `TemplateEditorRoute`, which keys it by
template (`templateEditorRouteKey`). The write itself goes through `useTemplateSave`
(`src/hooks/useTemplateSave.ts`).

## Opening the editor

`useTemplateEditorModel` loads the template by id each time the editor opens
(`loadTemplateEditorData`), never from a Template list, and reports a failed load instead of
falling back to a cached copy: a list can be minutes old, so a teammate's newer save would be
missing from the form and the next save would end in a conflict. From that one response it keeps:

- the form's values, built from the sections as stored, not the display mapper's copy
  ([FRONTEND.md](../FRONTEND.md#template-editor-forms));
- the `version`, which the next save sends as `expected_version`;
- the visibility it loaded, so a save can tell whether the editor's own switch changed it;
- the slug, the Creator's username (`ownerSlug`, under which the Search & SEO panel previews the
  public URL, also for an Organization's template), and the owner (`ownership`).

The page creates the form only once the load has ended without an error and the permission check
below has answered. The form then follows the model's `initialValues` whenever they change: the
new-template route builds its defaults again once the model has mounted.

### Who may open the form

`resolveTemplateEditPermission` mirrors the API's `canEditTemplate`
(`functions/api/utils/template-permissions.ts`), which stays the authority:

- It answers `checking` until the viewer's Organizations have loaded.
- An Organization's template follows the viewer's role in that Organization, whichever context is
  active, never who created it. The new-template route follows the active context's role, and a
  Personal template opens only for its owner.
- The API sends `team_id` only to members of the template's Organization. A template that carries
  one while the Organization list holds no role for it means the list is behind or failed to load,
  so the form opens and the save decides.
- A template of owner type `team` without a `team_id` is a public Organization template seen from
  outside its Organization. Its Creator is no longer a member, so they are refused too
  (`not_owner`).

`useTemplateEditPermission` decides once the template has loaded, and leaves a template whose
owner a failed load could not tell to the save (the page shows the load error instead). Once the
form has opened it stays open for the life of the editor: a teams refetch showing a lower role, or
a context switch on the new-template route, never takes unsaved edits off the page. The save is
still refused.

## Saving

1. Save is disabled while a file uploads or a Clipy draft generates.
2. The page sends a deep copy of the form taken at click time
   ([FRONTEND.md](../FRONTEND.md#template-editor-forms)).
3. `saveTemplateEditorData` validates the copy, and when a field breaks a rule it returns errors
   that name the field without calling the API.
4. `useTemplateSave` applies the save defaults and sends a create or an update. An update sends
   the `expected_version` the editor holds, and refuses to save without one. It leaves out
   `rules` and an unchanged slug ([FRONTEND.md](../FRONTEND.md#template-editor-forms)), and it
   sends visibility only when the editor's switch changed it: a Share, or a switch to private,
   made on the detail page or in another tab after the editor loaded would otherwise be undone by
   the next save of an unrelated edit.
5. A successful update answers with the version and slug it stored. The model keeps that version
   for the next save, never a local `+1`, and returns the saved values (`savedValues`): the title
   and sections as stored after the defaults, with the slug the API kept or suffixed. A failed
   save keeps the version it had.
6. The page rebases the form onto the saved values, keeping any field edited while the save was in
   flight ([FRONTEND.md](../FRONTEND.md#template-editor-forms)). A field counts as edited when it
   differs from what was sent, not from what was stored, since a trimmed title or a final slug
   would otherwise look like an edit. A missing key and an `undefined` value are equal: the form
   sets optional fields either way.

### Results that arrive after the editor moved on

A save belongs to the editor that started it. When it finishes after the editor unmounted, or
while the editor shows another template (`shouldApplyTemplateEditorSaveResult`), the model returns
it marked `stale` and leaves its version and slug alone, since they belong to what the editor shows
now; the page only reports it ([FRONTEND.md](../FRONTEND.md#template-editor-forms)). The page also
ends its visit when the user leaves the path ([FRONTEND.md](../FRONTEND.md#data-and-state)).
`saveTemplateForVisit` still settles the kept draft from the result, since what the API did does
not depend on where the user went, and hands the result to the page only while the visit is
current.

### Conflicts

A save refused with `409 edit_conflict` (someone saved the template after the editor loaded it)
shows its error with Load latest version, which asks first when the form holds unsaved changes
(`EDITOR_LOAD_LATEST_MESSAGE`). `reload()` then forgets which template was loaded and loads it
again: loading shows the page's spinner, which unmounts the form, so the editor comes back with the
latest values and version.

## Uploads in the form

A picked file reaches the form only when its upload finishes, so until then Save would store the
block without it, and leaving would drop it. The editor page owns the store of pending uploads
(`usePendingTemplateEditorUploads`), above the upload fields: selecting another task unmounts a
field while its upload keeps running, and the result still lands in the form, since the block is
found by id ([template content types](template-content-types.md#7-consider-uploads)). Fields report
each upload through `TemplateEditorUploadsContext` (`useTrackTemplateEditorUpload`), and nothing
is tracked outside the editor. An upload counts until its promise settles, whether it succeeds or
fails, and the same promise counts once.

While one is pending, Save is disabled, leaving asks with its own question, and Restore draft asks
first, since the file would land in the restored form. A session that ends in the background loses
an upload in progress: only the form's values are kept.

## The leave guard in the editor

`useTemplateEditorLeaveGuard` is the shared guard ([unsaved changes](../FRONTEND.md#unsaved-changes))
plus a re-arm when the page comes back from the back/forward cache: a checkout redirect allowed the
exit, and edits made after Back must ask again.

- `shouldBlockTemplateEditorNavigation` asks while the form is dirty or a file is uploading, once
  the template has loaded. A save in flight never lifts it: the save can still fail (a conflict, a
  slug rule, a network error, or the unload aborting it), and until it succeeds the edits exist
  only in the form. A save only changes the question (`getTemplateEditorLeaveMessage`), which names
  an upload first, then a save in flight, then unsaved changes.
- When the session ends in the background, a clean form has nothing to keep, and a dirty one is
  kept as a draft (`keepDraft`, below).
- Generating a Clipy draft and Restore draft replace the whole form, so each asks first when there
  is unsaved work (`confirmReplaceTemplateDraft`, `restoreKeptTemplateDraft`). Clipy asks before
  its request, so a no costs no generation.

## Kept drafts

The editor keeps the form on the tab when the user is about to lose the page for a reason they fix
elsewhere, and offers it back when the editor opens again (`templateDraftStore.ts`).

- **Storage.** Drafts live in `sessionStorage`, not `localStorage`: it survives the same-tab
  redirects to Stripe Checkout and the login page, and ends with the tab, so a shared device keeps
  nothing. A new template's draft is keyed by user and context, and kept edits by user and
  template, so a draft never opens for another account, context or template. Kept edits record the
  version they were made on (`baseVersion`), and a restored draft saves against it, so a save made
  since then ends in a conflict instead of an overwrite. A stored value is parsed with a Zod schema
  of its structure only: a save checks the field limits again. When storage is blocked or full a
  write reports failure (the page then says the changes could not be kept), and a read finds
  nothing.
- **When a draft is kept.** Before checkout or sign-in from a notice (`startUpgrade`,
  `signIn`, which then allow the exit, since nothing is lost), when the session ends in the
  background (`keepDraft`, called by the leave guard while the page still holds the user who typed
  it), and after a new template's save is refused as a plan gate or for an ended session
  (`settleDraft` keeps the values that were sent).
- **When it is offered.** When the editor opens: the active context's draft on the new-template
  editor, or the user's own kept edits to this template. Drafts are in the browser, so the server's
  render and hydration offer none (`useIsClient`), and the editor reads them again whenever it
  opens for another template, context or user.
- **The offered draft's slot.** A new template's draft offered when the editor opened belongs to
  that earlier work, not to whatever the form holds now. Until the user restores or discards it, a
  different template written in the form neither clears nor replaces it, whether that template
  saves, is refused, or is about to be kept. `keepDraft` then reports that nothing was kept, so the
  leave guard stays up and asks. The model holds the offered key in a ref (`offeredDraftKey`), so a
  save that finishes after the user left still reads the latest answer; Restore and Discard
  release it.
- **After a save.** `settleDraft` runs even when the user left during the save. Saved edits clear
  any kept edits, which were made on an older version. A saved create clears its draft, since
  restoring it would create a duplicate; a plan gate or an ended session keeps the values that were
  sent; any other failure leaves storage alone.
- **Restoring.** Restore hands the form a deep copy, and the draft stays stored until a save
  succeeds: the plan can still read Free for a moment after checkout, and a refused save would need
  the draft again.
- **Another context.** A confirmed sign-out returns the tab to Personal, so after sign-in a draft
  kept in an Organization is not the active context's. `listTemplateDraftContexts` finds the
  user's new-template drafts in every context, newest first, by a key prefix that ends after the
  user id, so a user whose id starts the same never matches. `findOtherContextDraft` decides only
  once the Organization list has loaded, since the tab may still be moving into the stored
  Organization, and offers only a context the user can still create templates in. The editor
  offers a switch to that context, which opens that context's new-template page, where it offers
  the draft itself: a draft is restored, and saved, only in the context it was written for. Discard hides the offer until the next lookup.

## Plan limits and session notices

- `useTemplateEditorAccess` reads billing status only on the new-template editor, the only one
  with a limit to hit, and loads the workspace list only when the plan has a template limit
  (`shouldLoadTemplateCountForLimit`), so an editor of an existing template never reads a list. It
  counts the context's own templates (`countContextTemplates`), since in Personal the list also
  holds catalog templates. An unknown plan or count (still loading, or failed) never counts as
  reached: the API stays the authority, and the save still handles its refusal.
- A refused save becomes a notice with its action (`resolveTemplateSaveFailureNotice`). A plan gate
  offers Personal checkout, except in an Organization, whose limits a Personal checkout cannot
  lift, or when billing is off; an ended session offers sign-in; billing being down shows its
  message. Any other failure stays in the error list.
- Upgrade to Pro keeps the draft, starts checkout with its pending flag (`useRedirectPending`), and
  guards the page again when checkout does not start. When Back restores the page from the
  back/forward cache, the editor refetches billing status, since the plan may have changed at
  Stripe or in another tab.

## The template detail page

The private detail page (`/dashboard/templates/<id>/`) and the public template page
(`/profile/<user>/<slug>/`) show one template and act on it through `useTemplateDetailModel`.
Which controls each viewer gets is in [features](../product-specs/features.md#templates), how
both pages load and refresh in [FRONTEND.md](../FRONTEND.md#data-and-state), and the private
page's cache key in [client data](client-data.md#cache-keys).

### Loading

`loadTemplateDetailData` reads one template:

- The public page takes a bundled library template when its owner matches, since the API cannot
  serve those. Otherwise it looks a UUID up as an id first and then as a slug, since a slug saved
  before the API refused UUID slugs can look like one
  ([import/export](data-persistence.md#importexport)), and anything else as a slug. The answer
  counts only when the template is public and its Creator's username matches the URL's, in any
  letter case.
- The private page takes a bundled library template by id, then asks the API by id, and by slug
  only after a `404` for an identifier that does not look like an id: the app links private
  templates by id, and the API never gives out a slug that looks like one.
- Both fill in the Creator's username from their profile when the row lacks it
  (`hydrateTemplateOwner`), since the public URL needs it, and only a `404` counts as not found
  ([missing pages](../FRONTEND.md#missing-pages)).

### Actions

Start Run, Copy, Duplicate and Share resolve to an outcome (`TemplateDetailActionResult`) instead
of acting on the page, and `followTemplateActionResult` acts on it only while the user is still on
the page that started it ([FRONTEND.md](../FRONTEND.md#data-and-state)).

- **Copy** (`saveTemplateToAccount`) checks, in order: that the template can be copied at all (the
  API clones only public templates, and library templates come from the bundle), so a private
  template never sends anyone to checkout for a copy that cannot succeed; that the user is signed
  in; that the active context is known, since until a stored Organization is confirmed the
  context reads Personal, and a copy would land in Personal or start a Personal checkout; then, in
  Personal only, the plan. A plan still loading, or a failed check, asks the user to try again and
  is never taken as Free, and Free asks for an upgrade. In an Organization the API decides: a Free
  Organization may copy within its Template limit, and a limit it reached is an error with the
  server's message, since a Personal checkout cannot lift it
  ([error types](client-data.md#error-types)).
- **Duplicate** (`duplicateOwnedTemplate`) creates the copy where
  `resolveTemplateDestinationTeamId` sends it (a private template of another Organization stays in
  that Organization), and counts against that context's template limit. `POST /api/templates` has
  no idempotency, and the actions menu closes on the first click while a slow copy shows nothing,
  so the page ignores Duplicate and Copy until the copy in flight settles (`cloneInFlight`, a ref
  set before the request, since a second click can arrive before the page re-renders). The item
  reads "Duplicating..." meanwhile, and a failed copy can be tried again.
- **Share** (`shareTemplateToPublic`) builds the public URL before it changes anything, so a
  template that cannot be shared (its Creator has no username) is never made public. The URL uses
  the Creator's current username (`resolveShareOwnerTemplate`): the signed-in Creator's own, which
  wins over the one a cached copy carries after a rename, or, for someone else's template, the
  Creator's looked up again, keeping the cached one only when that fails. The server then confirms
  every Share with the loaded version, even when the loaded copy is already public: a template made
  private, archived or given a new slug elsewhere answers `409` or `404`, and the page reloads it
  instead of handing out a dead link. A public library template is not a stored row, so there is
  nothing to confirm. The link uses the slug the server returned.
- **The visibility switch** (`setTemplateVisibility`) sends only `is_public`, with the loaded
  version.

Share and the switch write the same template version, so each is disabled while either runs.
They apply what the server accepted (the version and slug in its answer,
`applyTemplateSaveResult`) only while the page still shows that template, and after a stale-copy
answer they reload the template before the control re-enables
([client data](client-data.md#stale-copies-and-conflicts)). An accepted change stands even when
refreshing the lists afterwards fails (`tryRefreshTemplateLists`): they catch up on their next
fetch.

### Export

`exportTemplateFile` builds the portable pack in the browser, so no server check can gate it: the
active context's plan does, and a failed plan check asks for a retry, never an upgrade. A template
the pack format cannot hold is left out of the pack and named in its manifest, so a pack left
empty is not downloaded, and the error names the reason. The file is named after the slug, or the
id, with control characters and the characters Windows reserves replaced.

### Changelog

`buildTemplateHistoryTimeline` merges the template's versions and audit events into one list,
newest first. A versioned write records its audit event with the same action and time
([JSON columns](data-persistence.md#json-columns)), so an event that shares both with a version is
that version's, and shows once. A visibility change reads "Made template public" or "Made template
private" from its metadata. The page asks the API for `HISTORY_DISPLAY_LIMIT` entries of each
list, newest first, which always hold the newest `HISTORY_DISPLAY_LIMIT` entries of the merge.
