# Organization public profiles

- **Status:** active
- **Last updated:** 2026-10-05
- **Goal:** An Organization with a handle has a public profile at `/profile/:handle` (name, handle,
  avatar, description and its public Templates), its public Templates live at
  `/profile/:handle/:slug`, and every link to them moves there (issue #232).

## Progress

- [ ] PR 1: Organization avatar and description. Migration `0030` adds `teams.avatar_url` and
  `teams.description`. The Organizations list and `PUT /api/teams/:id` carry them, and owners
  and admins edit them on the Organization's settings page.
- [ ] Apply `0030` to staging (owner go-ahead at that step).
- [ ] Before promoting PR 2 to production: production needs `0028` and `0029` (the
  [public handles plan](public-handles.md)) and `0030`, since `/api/profiles/by-handle` reads
  `public_handles` and the Organization's avatar and description (`verify:prod:d1` fails
  until then). Each migration waits for the owner's go-ahead.
- [x] PR 2 (2026-10-05): `/profile/:handle` resolves through the public handle registry (#233)
  to a User's or an active Organization's profile (`GET /api/profiles/by-handle`).
  `/profile/:orgHandle/:slug` serves an Organization's public Template (`GET
  /api/templates/public?handle=` lists them), and public lookups are owner-qualified: the
  public template page, its metadata (`functions/seo/public-template-lookup.ts`) and
  `/api/templates/slug/` answers name the Template Owner, and the page opens a Template only
  under that owner's handle. No migration.
- [x] PR 3 (2026-10-05): the one resolver (`resolvePublicTemplateOwnerSlug`, which
  `buildCanonicalPublicTemplatePath` uses) gives an Organization Template its Organization's
  URL, so Share, "View public template", the library's and profiles' cards, owner links,
  canonical tags, the editor's URL preview and the sitemap entries moved together
  (`templateOwnerHandle` in `functions/sitemap/shared.ts`). The Creator URLs Organization
  Templates had redirect there with a 308. No migration.

## Decision log

- 2026-10-04 (owner, on #232): an Organization's profile is public whenever it has a handle,
  with or without public Templates. It shows the name, handle, avatar and description, and its
  public Templates. Avatar and description are new `teams` columns, up to staging; owners and
  admins edit them on the Organization's settings page. Today's Creator URLs for Organization
  Templates redirect permanently (308) to the Organization URL.
- 2026-10-05: The avatar reuses the account flow: an upload to the `avatars` bucket, whose URL
  the API accepts only when SERP Lists serves it (`uploadedAvatarUrlError`, shared with user
  avatars). `AvatarUpload` takes the save as a prop; it defaults to the signed-in account. An
  Organization avatar's earlier file is deleted when the admin replacing it uploaded it;
  another admin's upload stays in R2, since uploads can only be deleted by their uploader
  (orphans are the upload quota plan's cleanup).
- 2026-10-05: The description is plain text, at most 500 characters, trimmed; an empty one
  clears it. The settings form saves it with the name and slug; the avatar saves as soon as
  it is uploaded or removed, as the account avatar does.
- 2026-10-05: The Organizations list (`GET /api/teams`) carries the avatar and description, so
  the settings form and later the switcher read them from the active Organization without
  another request.
- 2026-10-05 (PR 2): one lookup decides who a handle names: `GET /api/profiles/by-handle`
  reads `public_handles` by its primary key and joins the User or the Organization by theirs
  (2 rows). It answers a User with the fields `/api/profiles/by-username` answers, plus
  `type`, so a User's profile is unchanged, and an Organization with only `type`, `handle`,
  `name`, `avatar_url` and `description`: never its id, members, roles, invites, billing,
  runs or audit events. An archived Organization keeps its handle but answers 404, like a
  handle no one holds, and so do its Templates' pages.
- 2026-10-05 (PR 2): an Organization's public Templates are listed by its handle
  (`GET /api/templates/public?handle=`), not its id, so no public response carries an
  Organization's id. The list reads that Organization's Templates through
  `idx_templates_team_id` (`+owner_type` and `+is_public` keep the planner off the other
  indexes), as a User's reads theirs through `idx_templates_owner`, so it needs no new index
  and no migration.
- 2026-10-05 (PR 2): public responses now name an Organization Template's Organization by its
  handle and name (`owner: { type: 'team', publicHandle, displayName }`) while the
  Organization is active and has a handle; otherwise, as before, only `{ type: 'team' }`. The
  avatar stays out: no card or template page shows an owner's image. `templateOwnerOf` gives
  an archived Organization no handle or name, which only public responses can show, since an
  archived Organization has no active members. The catalog's edge cache key changed with the
  shape (`fields=public-with-owner-handles`).
- 2026-10-05 (PR 2): the Organization Public Profile reuses the User profile's layout
  (`PublicProfileDetails`): the avatar or its initials, the name, `@handle`, the description
  (or the generated summary of its public Templates when it has none), the same three stats,
  and the same "Public Templates" cards, linked under the Organization's handle. It has no
  meta row: an Organization has no location, website or join date to show. A handle in
  another letter case replaces itself with the stored one, as a username does.
- 2026-10-05 (PR 2): `GET /api/profiles/by-username` stays for tabs loaded before this
  change (TD-84).
- 2026-10-05 (PR 2): until PR 3, cards, Share and the sitemaps still build an Organization
  Template's Creator URL, which no longer opens the Template ("Template not found"); land PR 3
  with PR 2. The server-rendered canonical URL of an Organization Template already follows the
  lookup, so the page found at the Organization's URL names that URL.
- 2026-10-05 (PR 3): an Organization Template is one whose `owner` is an Organization, or,
  without `owner`, whose `ownerType` is `team` or that has a `teamId`
  (`isOrganizationTemplate`); its URL handle is only ever `owner.publicHandle`, so a response
  that names no handle (an archived Organization, one without a slug, an older response)
  gives it no public URL rather than its Creator's. The library, category pages and the
  sitemaps then leave it out, as they leave out a User without a username.
- 2026-10-05 (PR 3): the 308 comes from the template page itself: the route's page awaits the
  same lookup its metadata uses (`loadTemplatePageSeo`, edge-cached for 5 minutes for a found
  Template) and calls `permanentRedirect` before it renders, keeping the query string, since a
  redirect thrown in a streamed part would only be a client-side refresh. The lookup record
  carries the Creator's username for it (`/__page-meta/v4/templates/`). Only the Creator's
  username redirects, in any letter case and by slug or id; another User's handle stays not
  found, and an archived Organization's Template has no URL to redirect to. A proxy
  (middleware) redirect was rejected: it would add the same lookup in front of every page.
- 2026-10-05 (PR 3): an Organization without a handle gives its Templates no public URL, as
  #234 made safe. Share leaves the Template private with "This Organization needs a slug
  before its templates can be shared. Its owners and admins can set one in its settings.";
  the detail page says "Public page unavailable until its Organization has a slug"; the
  editor's preview says "No public URL yet: the Organization needs a slug, which its owners
  and admins can set in its settings." Organizations get a slug when they are created, so
  only data from before that can lack one.
- 2026-10-05 (PR 3): Share on an Organization Template no longer looks up its Creator's
  profile (`resolveShareOwnerTemplate` runs for Personal Templates only).
- 2026-10-05 (PR 3): cached sitemaps (TD-23): the 0023 triggers still fire only for Personal
  rows and no trigger watches `teams`, so an Organization Template's edit, publish, unpublish
  or delete, and its Organization's slug change or archive, reach the cached templates and
  categories shards only when they expire (at most a day). The proposed migration in the
  [sitemap plan](sitemap-organization-templates.md) needs a `teams` trigger before approval.
- 2026-10-05 (PR 3): the committed sitemap catalog
  (`functions/sitemap/bundled-catalog.generated.json`) dates the sitemap code by its newest
  commit, so it moves with this PR's commit to `functions/sitemap/`; the build regenerates it
  (`pnpm run sitemap:generate`).
