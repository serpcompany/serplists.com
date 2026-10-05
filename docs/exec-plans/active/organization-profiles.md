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
- [ ] PR 2: `/profile/:handle` resolves through the public handle registry (#233) to a User's or
  an Organization's profile. `/profile/:orgHandle/:slug` serves an Organization's public
  Template, and public lookups are owner-qualified.
- [ ] PR 3: the one resolver (`resolvePublicTemplateOwnerSlug`, which
  `buildCanonicalPublicTemplatePath` uses) gives an Organization Template its Organization's
  URL, so Share, cards, canonical tags and sitemap entries move together. The Creator URLs
  Organization Templates have today redirect there with a 308.

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
