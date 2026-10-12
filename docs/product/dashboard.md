# Dashboard navigation

Canonical private routes, which always show Personal:

- Home: `/dashboard` opens the remembered context's Templates once the user's Organizations
  confirm it, and Personal's when they rule it out
- Templates: `/dashboard/templates`
- New template: `/dashboard/templates/new`
- Template detail: `/dashboard/templates/:id`
- Template editor: `/dashboard/templates/:id/edit`
- Import/export: `/dashboard/import-templates`
- Runs: `/dashboard/runs`
- Run detail: `/dashboard/runs/:id`, a Run's one URL. The runs list and Start Run both open
  it, and the older `/run/:id` answers 308 with it, keeping the query string.
- Settings: `/dashboard/settings`
- Archive: `/dashboard/archive`, linked from the console sidebar (a sheet on phones)

Each Organization has the same pages under `/dashboard/organization/:organizationId`
(`/templates`, `/templates/new`, `/templates/:id`, `/templates/:id/edit`, `/import-templates`,
`/runs`, `/runs/:id`, `/settings`, `/archive`), named by the Organization's stable id, and
`/dashboard/organization/:organizationId` itself opens its Templates. An Organization URL
always shows that Organization to its members, after a refresh or in another tab, and the
links on its pages stay in it. A Run, a private Organization Template, and a Run or copy an
action just made open at the URL of the context that owns them, whichever context is
selected, and one opened at another context's URL moves to its owner's URL (Back skips the
wrong one). For anyone else, and for an archived or unknown Organization, it
shows the not-found page and loads none of its data.

A missing page under `/dashboard/` answers 404 with the not-found page: in the console shell for a signed-in user, once the session check answers, and in the public shell (site header and footer) for anyone else.
