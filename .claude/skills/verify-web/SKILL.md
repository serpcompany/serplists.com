---
name: verify-web
description: Check a SERP Lists change in a real browser. Runs the app locally (pnpm run dev:all, or pnpm run preview for the production build), drives it with the chrome-devtools MCP server (navigate, accessibility snapshot, click and fill, screenshot, video recording, console, network, phone widths), and compares the result with the product specs. Use after changing pages, components, routes, redirects, headers, or anything else the UI shows, and to reproduce a UI bug before fixing it.
---

# Check a change in the browser

The `chrome-devtools` MCP server in `.mcp.json` opens its own Chrome with a temporary profile
(`--isolated`), so sessions in different worktrees never share cookies or state. Run commands
from the root of your worktree. Every page tool takes a `pageId`, which `list_pages` and
`new_page` return.

## 1. Run the app

- **`pnpm run dev:all`** for pages, components, and the API. It serves both on one origin at a
  free port, prints the URL, saves it in `tmp/dev-session.json`, and mirrors its output to
  `tmp/logs/dev-all.log`. When this worktree already runs one, it prints that URL and exits:
  use that server.
- **`pnpm run preview`** for redirects, headers, caching, and anything else only the production
  build does. It builds with OpenNext and serves the Worker in workerd at
  `http://localhost:8787` (`pnpm run preview --port <n>` for another port; leave out the `--`
  pnpm scripts usually take, since pnpm passes it on). Links the app builds from
  `FRONTEND_URL` (emails, invites, checkout returns) still point at port 3000 unless you add
  `--var FRONTEND_URL:http://localhost:8787`.

Open `localhost`, not `127.0.0.1`: mixing the two drops the session cookie. A new worktree needs
`pnpm install && pnpm run setup` first. Run one app at a time on this machine. Stop `dev:all`
with `pnpm run dev:stop` (killing it leaves Next.js and workerd holding the port on Windows), and
stop a preview you started by ending its whole process tree. More in the Run section of
`docs/design-docs/development-environment.md`.

## 2. Sign in

Seeded users share the password `password123`: `admin@test.com` is Pro, and `john@test.com` is
Free and a member of the seeded Organizations. The Sign in section of
`docs/design-docs/development-environment.md` lists the rest. Under `pnpm run dev:all`,
`/login/` has quick-fill buttons; the preview has none, so `fill_form` the email and password and
click **Sign in**.

## 3. Reproduce first

For a bug, open the failing page before changing code and keep the evidence in `tmp/snapshots/`
(ignored by git; `pnpm run ui:snap` saves there too). Give tools absolute paths inside your
worktree.

- `take_screenshot` and `take_snapshot` with a `filePath`.
- A recording: `screencast_start` with a `filePath` ending in `.webm` or `.mp4`, go through the
  steps, then `screencast_stop`. Recording needs ffmpeg on the PATH. Only frames where the page
  changes are recorded, so start before the steps: a page that never changes records an empty
  file.

After the fix, record the same steps again, so the PR shows both the failure and the fix.

## 4. Check the change

For each page the change touches:

1. `navigate_page` to its URL. Page URLs end in a slash (`/dashboard/templates/`); a URL without
   it only tests the redirect.
2. `take_snapshot` reads the accessibility tree: check text, headings, labels, links, and order
   there rather than guessing from a screenshot. Its `uid`s are what `click`, `fill`, `fill_form`,
   and `hover` act on; `wait_for` the text that shows the result.
3. Leaving a page with unsaved changes opens the browser's confirm dialog: answer it with
   `handle_dialog`.
4. `take_screenshot` checks layout, at desktop and phone widths. Set the width with `emulate`
   (`viewport` `"1440x900x1"`, or `"390x844x3,mobile,touch"` for a phone), then reload the page.
   Avoid `resize_page`: in a headless session, a tab it resized stopped receiving clicks and key
   presses, while a script's `click()` still worked, which looks like an app bug but is not.
5. `list_console_messages`: no errors. A hydration error (React error #418 or #423) means the
   server HTML differs from the first render in the browser, usually because something read
   `window`, the time, or storage while rendering (`src/hooks/useIsClient.ts` defers that).
6. `list_network_requests`: no failed requests. `get_network_request` on an API call shows its
   `x-request-id` header; the `debug-api` skill finds that request's lines in the server log.
7. Compare what you see with the behavior's entry in `docs/product-specs/index.md`. A
   difference with no decision on file is a bug.

In the preview, also check what only the production build does, with `get_network_request` on
the page's document request: a URL without its slash answers `308` to the canonical URL,
prerendered pages carry `x-opennext-cache: HIT`, and every response has the security headers
and, as a non-production site, `X-Robots-Tag: noindex, nofollow`.

Measure speed in the preview, not `next dev`: `performance_start_trace`,
`performance_stop_trace`, and `performance_analyze_insight`, or `lighthouse_audit`.

## 5. Report

Say which URLs, widths, and user you checked, what the snapshot showed for the behavior you
changed, whether the console and network were clean, and where the screenshots and recordings
are. A check you couldn't run is reported as not run, not as passed. A UI change needs this
evidence in its PR (the definition of done in `AGENTS.md`).

## Setup

- The first session in a checkout asks you to approve the `chrome-devtools` server. `npx`
  downloads the pinned version on first use.
- Chrome must be installed. Recording needs ffmpeg (`winget install ffmpeg`,
  `brew install ffmpeg`).
- No display (a cloud or CI agent): add `--headless` with a local override from the repository
  root, which Claude Code prefers to the project's entry:
  `claude mcp add chrome-devtools --scope local -- npx -y chrome-devtools-mcp@1.10.1 --isolated --headless --experimental-screencast --no-usage-statistics --no-performance-crux`
