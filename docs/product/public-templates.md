# Public Templates

A public Template's page, `/profile/{handle}/{templateSlug}`: who it names as its owner, its one
URL, what a visitor or member can do there, copying, and how its link unfurls. The library and
category pages are in [Template library](template-library.md), and guest runs in
[Guest runs](guest-runs.md).

Abbreviations: **Template owner API** is `tests/unit/functions/api/template-owner-d1.test.ts`,
**Public fields** is `tests/unit/functions/api/templates-public-fields.test.ts`, **Routes** is
`tests/unit/lib/routes.test.ts`, **Organization pages** is
`tests/unit/server/pageMeta/organizationPages.test.ts`, **Organization profile spec** is
`tests/e2e/organization-public-profile.spec.ts`, **Template page meta** is
`tests/unit/server/pageMeta/templatePage.test.ts`, **Reserved slugs** is
`tests/unit/functions/api/templates-reserved-slugs.test.ts`, **Public page view** is
`tests/unit/components/PublicTemplateView.test.tsx`, **Public page** is
`tests/unit/views/PublicTemplate.test.tsx`, **Load errors spec** is `tests/e2e/load-errors.spec.ts`,
**Route structure spec** is `tests/e2e/route-structure.spec.ts`, **Freshness spec** is
`tests/e2e/public-template-freshness.spec.ts`, **Public page context** is
`tests/unit/views/PublicTemplate.context.test.tsx`, **Public actions spec** is
`tests/e2e/public-template-actions.spec.ts`, **Clone API** is
`tests/unit/functions/api/templates-handler.clone.test.ts`, **Organization clone API** is
`tests/unit/functions/api/templates-clone-organization.test.ts`, and **Social unfurl spec** is
`tests/e2e/social-unfurl.spec.ts`.

## The Template Owner

Every Template the API sends names its Template Owner (`owner`), never the Creator who made it: the
User, with their username and name, for a Personal Template, and for an Organization's Template,
the Organization with its slug and name to its members.

- Check: Template owner API, "the owner of a Template in API responses, read from its stored owner
  type and Organization".

Public responses name an Organization only by its handle and name, and only while it is active and
has a handle; otherwise they say only that an Organization owns the Template. They never send its
id, or who in the Organization created or edited the Template.

- Check: Public fields, "names an Organization only by its public handle and name, says only that
  one owns a template while it has no handle, and keeps only the public fields of a User owner" and
  "only says an Organization owns a template once the Organization is archived, naming neither its
  handle nor its name".

## One public URL

A public Template is shared at `/profile/{handle}/{templateSlug}`, under its Template Owner's
handle: a Personal Template's username, or an Organization's slug while the Organization is
active. Share, owner links, cards, canonical URLs and the sitemaps all build that one URL
(`resolvePublicTemplateOwnerSlug`).

- Check: Routes, "resolves public owner slugs from template ownership data", "resolves an
  Organization Template to its Organization's handle, and never falls back to its Creator" and
  "builds canonical public template paths from template records".

An Organization's Template opens only under its Organization's handle, at
`/profile/{organization handle}/{templateSlug}`, never under its Creator's username, and a Personal
Template never under an Organization's handle. An archived Organization's Template opens under no
handle.

- Check: Organization pages, "does not find a Personal Template under an Organization's handle",
  "does not find the Template of an archived Organization under any handle, nor redirect its Creator
  URL" and "never redirects another User's URL for an Organization Template".

The Creator URL a public Organization Template had before
(`/profile/{creator username}/{templateSlug}`) answers a permanent redirect (308) to its
Organization's URL, keeping the query string.

- Check: Organization profile spec, "the Creator URL an Organization Template had answers one
  permanent redirect to its Organization's URL, keeping the query".

The page also opens for other letter cases of the handle and for the Template's id, but its
canonical URL and `og:url` are always `https://serplists.com/profile/{handle}/{templateSlug}`, with
the stored handle casing and no query string, matching the sitemap entry.

- Check: Template page meta, "points the canonical URL, og:url and JSON-LD at the one production
  slug URL from a visit by id, in another letter case" and "names the production site on staging
  and workers.dev hosts, as the sitemap does".

A slug is never a UUID, which the page would read as an id: a save that asks for one gets a short
suffix, and an older Template that already has one keeps it and still opens at it.

- Check: Reserved slugs, "suffixes a requested UUID slug on create" and "keeps a UUID slug a
  Template already holds, so saving never changes its shared URL".

## The page

The page says when the Template was last updated ("Updated `<date>`", its `updated_at`, else
`created_at`), in the viewer's time zone and the same short date format as the Template detail
page's "Last updated". The public Template response already carries both dates, so the page reads
nothing extra.

- Check: Public page view, "says when the Template was last updated" and "reads a database
  timestamp and falls back to the created date".

The page loads the Template itself, so edits and unpublishing show even after the catalog loaded.

- Check: Freshness spec, "shows edits and unpublishing on a public template page after the catalog
  loaded".

It says the Template was not found only when the API answers 404, or the Template is not public
under that owner. A server or network failure shows "Unable to load" with a Try again button
instead.

- Check: Public page, "offers a retry for a failed load instead of saying the template is gone" and
  "keeps the not found message for a template that is really missing".

Every route is served with HTTP 200, so the not-found state sets `robots` to `noindex, nofollow`,
and a removed, private or renamed page drops out of search. The "Unable to load" state does not,
so a brief outage never deindexes a live page.

- Check: Public page, "tells search engines to drop a template that is gone" and "keeps a template
  that failed to load indexable, since the failure may be temporary".

A public profile does the same: a failure to load it offers Try again.

- Check: Load errors spec, "a public profile offers a retry when loading the profile fails".

A missing public profile, like a missing Template, is `noindex, nofollow`.

- Check: Route structure spec, "missing public profiles and templates render noindex,nofollow".

## What a viewer can do

The page uses the active ownership context for its plan check, Save and Start Run. A visitor who
is not signed in starts a [guest run](guest-runs.md).

- Check: Public page context, "loads billing, clone and run targets for the active Organization"
  and "keeps Personal as the context when no Organization is active".

In an Organization it follows the viewer's Organization Role, as the Template detail page does:
roles that cannot add Templates to the Organization (runners and viewers) see no Save or Copy to
Library, roles that cannot start runs (viewers) see no Start Run, and the page says which actions
their role does not allow.

- Check: Public page context, "never offers Save to an Organization role that cannot add
  Templates", "keeps Start Run for a runner, who may start runs but not add Templates" and "never
  offers Start Run to an Organization role that cannot start runs".

Save opens the new copy, and a copy into an Organization reports "Template copied to this
Organization".

- Check: Public page context, "opens the saved copy in the Organization it was saved to, so the
  user lands where it was saved" and "says the copy went to the Organization, as the template
  detail page does".

In Personal, a signed-in Free user's Save buttons read "Upgrade to save" and "Upgrade to copy
template", since the click starts checkout. They are disabled while the plan loads.

- Check: Public page view, "tells a signed-in Free user in Personal that Save and Copy lead to an
  upgrade, since copying into Personal is a Pro feature" and "disables Save and Copy to Library
  while a signed-in plan is loading".

When the plan check fails they keep their plain labels, and a click asks the user to try again.

- Check: Public page context, "never labels Save as an upgrade when the plan check failed".

An Organization never sees an upgrade label there, because the API checks its Template limit.

- Check: Public page view, "never asks for an upgrade in an Organization, where the API checks the
  limit".

When an Organization's plan blocks Save or Start Run, the page explains that the Organization needs
a paid plan instead of starting a Personal checkout.

- Check: Public page context, "shows the Organization plan message instead of Personal checkout
  when Save needs a paid Organization" and "shows the Organization plan message instead of Personal
  checkout when a run hits the Organization limit".

A failed Save keeps the Save button instead of showing Saved.

- Check: Public actions spec, "a failed Save keeps the Save button instead of showing Saved".

## Copying a public Template

Other Users can copy public Templates into Personal or into an Organization they may add Templates
to, when that context's plan allows it. Copying into Personal is a Pro feature: on Free the API
answers `403 upgrade_required`.

- Check: Clone API, "copying a public template" and "clones a public template for Pro users, whose
  copies no template count limits".

In an Organization the API decides: a Free Organization may copy within its Template limit and
gets `limit_reached` at it, and a role that cannot add Templates is refused.

- Check: Organization clone API, "copies into a Free Organization that is under its Template
  limit", "reports limit_reached once the Free Organization is at its limit" and "refuses a role
  that cannot add Templates to the Organization".

The API copies only public Templates.

- No automated check yet.

## Link previews

Links to a public Template, a category page, `/categories` or `/templates` unfurl in Slack, X,
Facebook, LinkedIn, Discord and iMessage with that page's own title and description and the
site's 1200x630 preview image (`public/og-default.png`).

- Check: Social unfurl spec, "a shared public template unfurls with its own title and a PNG card"
  and "category and library links unfurl with their own titles".

A Template's preview uses its SEO title and description when they are set, and its title and
description otherwise.

- Check: Template page meta, "uses the SEO title and description saved with a published template"
  and "falls back to the ordinary title and description when the saved SEO fields are empty".

Link previews do not run JavaScript, so the server puts the tags into the page's HTML
(`src/server/pageMeta/`, which reads the Template through `functions/seo/`), and people get the
same tags as link-preview crawlers.

- Check: Social unfurl spec, "people get the same tags as link-preview crawlers".

A private, deleted or unknown Template unfurls as "Template not found", out of search
(`noindex, nofollow`) and without a canonical URL.

- Check: Social unfurl spec, "an unknown template unfurls as not found, out of search and without a
  canonical URL".

The server reads a Template for its page once per 5 minutes, so a Template made private can keep
its preview for up to 5 minutes. When the read fails, the page keeps the site's defaults and stays
indexable.

- Check: Template page meta, "reads D1 once per template and 5 minutes" and "keeps the site
  defaults, indexable, when the lookup fails".
