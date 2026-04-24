# Live UI Layout Audit - 2026-04-24

Scope: audited the current branch against the recent v0/parity plan and live routes on `http://localhost:8080`.

## Fixed In This Pass

- Light mode is the default again; the app no longer forces `dark` on `html`/`body`.
- The editor theme toggle now changes and persists the document theme.
- `/dashboard/settings`, `/dashboard/templates/tpl-1`, and `/dashboard/templates/590b5273-6fce-4f80-828f-5ae1568860ee` no longer render nested dashboard sidebars.
- `/run/84fd6800-2309-496f-a0c8-be1c8c01d9bc` is inside the authenticated dashboard layout instead of the public/island shell.
- `/share/abc123` now uses the same tighter card radius, content width, sticky header, and compact typography direction as the rest of the v0-style surfaces.
- `/templates` and `/categories` no longer overflow horizontally on a 390px mobile viewport.
- Discovery routes keep their single discovery header instead of being nested into the generic public marketing layout.

## Remaining UI Debt

- `/dashboard/runs` still has a page header plus mobile shell header; this is not duplicated navigation, but the visual stack should be tightened on small screens.
- Run execution still combines dashboard navigation with a run progress rail. The rail is useful, but it should collapse or become a top progress section on mobile instead of acting like a second sidebar.
- Run list row actions are still partially hover-reliant. Touch and keyboard users need always-visible or focus-visible actions.
- Dashboard pages still hand-roll padding, widths, and page headers. Extract a `DashboardContentShell` and shared page header component to keep route layouts consistent.
- `share` has a visible "Create Your Own Copy" CTA with no real action; wire it to the intended copy/sign-up flow or remove it.
- Theme handling should be centralized fully. `sonner` still references `next-themes`, while the app now uses `src/lib/theme.ts`.
- `/dashboard/templates/new` and the editor panel surfaces still need a separate visual parity pass against the v0 reference.
- Auth pages remain outside this pass and still need a shell/style parity audit.
