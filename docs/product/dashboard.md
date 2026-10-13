# Dashboard navigation

The console's pages in Personal and in each Organization, which context a console URL shows, and
the console's not-found page.

Abbreviations: **Route builder tests** is `tests/unit/lib/routes.test.ts`,
**Organization routes spec** is `tests/e2e/organization-routes.spec.ts`,
**Routes spec** is `tests/e2e/route-structure.spec.ts`,
**Archive page tests** is `tests/unit/views/ArchivePage.test.tsx`,
**Organization route tests** is `tests/unit/views/OrganizationRoutes.test.tsx`, and
**Dashboard home tests** is `tests/unit/lib/dashboardHome.test.ts`.

## Personal pages

**Canonical routes.** These private routes always show Personal:

| Page | URL |
| --- | --- |
| Home | `/dashboard` |
| Templates | `/dashboard/templates` |
| New template | `/dashboard/templates/new` |
| Template detail | `/dashboard/templates/:id` |
| Template editor | `/dashboard/templates/:id/edit` |
| Import/export | `/dashboard/import-templates` |
| Runs | `/dashboard/runs` |
| Run detail | `/dashboard/runs/:id` |
| Settings | `/dashboard/settings` |
| Archive | `/dashboard/archive` |

- Check: Route builder tests, "builds the canonical console routes".

**Home.** `/dashboard` opens the remembered context's Templates once the user's Organizations
confirm it, and Personal's when they rule it out. Back skips `/dashboard`.

- Check: Organization routes spec, "the dashboard home opens the remembered Organization's
  Templates, and Back skips it" and "the dashboard home opens Personal for a remembered
  Organization the user is not in, and asks for none of its data".

**Run detail.** `/dashboard/runs/:id` is a Run's one URL. The runs list and Start Run both open
it, and the older `/run/:id` answers 308 with it, keeping the query string.

- Check: Routes spec, "a Run's old address answers one 308 with its one URL, keeping the query".

**Archive.** The console sidebar links the Archive (a sheet on phones).

- Check: Archive page tests, "links the archive from the console navigation and keeps
  /dashboard/runs on the runs list".

## Organization pages

**Same pages.** Each Organization has the same pages under
`/dashboard/organization/:organizationId` (`/templates`, `/templates/new`, `/templates/:id`,
`/templates/:id/edit`, `/import-templates`, `/runs`, `/runs/:id`, `/settings`, `/archive`), named
by the Organization's stable id. Settings is the Organization's own page
([Auth and account](account.md#settings)).

- Check: Organization route tests, "render the same pages as the Personal routes, under the
  Organization's layout, except Settings, which is the Organization's own page" and "read %s as a
  page of that Organization".

**Organization home.** `/dashboard/organization/:organizationId` itself opens its Templates.

- Check: Dashboard home tests, "sends an Organization's bare console URL, with or without its
  slash, to that Organization's home in one hop".

**The URL keeps its Organization.** An Organization URL always shows that Organization to its
members, after a refresh or in another tab, and the links on its pages stay in it.

- Check: Organization routes spec, "an Organization URL opens that Organization's Templates in a
  tab that remembered Personal, and a reload keeps it" and "a Template opened from an
  Organization's Templates, its run, and the way back all stay at that Organization's URLs".

**Records open in their owner's context.** A Run, a private Organization Template, and a Run or
copy an action just made open at the URL of the context that owns them, whichever context is
selected. One opened at another context's URL moves to its owner's URL, and Back skips the wrong
one.

- Check: Organization routes spec, "a Personal URL for a private Organization Template moves a
  member to the Organization's URL, and Back skips it" and "a Personal URL for an Organization Run
  moves to the Organization's URL and fits the screen".

**Not a member.** For anyone else, and for an archived or unknown Organization, an Organization
URL shows the not-found page and loads none of its data.

- Check: Organization routes spec, "an Organization the user is not in shows the not-found page
  and loads none of its data".

## Missing pages

**Console 404.** A missing page under `/dashboard/` answers 404 with the not-found page: in the
console shell for a signed-in user, once the session check answers, and in the public shell (site
header and footer) for anyone else.

- Check: Routes spec, "a missing console page is a public 404 for a visitor and a console 404 once
  signed in, without a hydration error".
