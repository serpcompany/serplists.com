---
name: verify-web
description: Check a SERP Lists change in a real browser. Runs the app from this checkout (pnpm run dev:all, or pnpm run preview for the production build on this checkout's own port), checks which process and build answer before trusting a page, drives it with the chrome-devtools MCP server (navigate, accessibility snapshot, click and fill, screenshot, recording, console, network, phone widths), keeps the proof under tmp/agent/verify/, and compares what it shows with the product docs. Use after changing pages, components, routes, redirects, headers, or anything else the UI shows, and to reproduce a UI bug before fixing it.
---

# Check a change in the browser

This is the look an agent takes by hand. What should keep working goes in a browser test (the
`browser-tests` skill). The `chrome-devtools` MCP server in `.mcp.json` opens its own Chrome with a
temporary profile (`--isolated`), so sessions in different worktrees never share cookies. Every
page tool takes a `pageId`, which `list_pages` and `new_page` return. Give tools absolute paths,
and run commands from the root of your checkout.

## 1. Start a run

Make the run's folder, `tmp/agent/verify/<YYYY-MM-DD>-<what>/` (git ignores it and housekeeping
keeps it), and write `run.md` there as you go: the URL, which server answers (step 2), the user
you signed in as, and what this run started. A later command, or another agent taking the work
up, has no other way to know them.

## 2. Run the app, and check what answers

- **`pnpm run dev:all`** for pages, components and the API, in the background. It serves both on
  one origin at a free port, prints the URL, records it in `tmp/dev-session.json`, and mirrors its
  output to `tmp/logs/dev-all.log`. When this checkout already runs one, it prints that URL and
  exits: use that server, and leave it running when you finish. Running it again is how to ask
  which server is this checkout's.
- **`pnpm run preview`** for redirects, headers, caching, and anything else only the production
  build does. It builds with OpenNext and serves the Worker in workerd on this checkout's
  `preview` port, which `pnpm run ports` prints (8787 in the main checkout, a port of its own in a
  worktree; `docs/agents/verification.md`, This checkout's ports). To check the build, build it
  with the commit: `NEXT_PUBLIC_RELEASE_COMMIT=$(git rev-parse HEAD) pnpm run preview`. Then the
  page's `<meta name="serplists-release">` and `/api/health`'s `release.commit` name it.

Before trusting a page, check that the server on the port is this checkout's and current:

- **Which process:** on Windows,
  `Get-NetTCPConnection -LocalPort <port> -State Listen | Select-Object -ExpandProperty OwningProcess`,
  then `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | Select-Object CommandLine`,
  whose path names the checkout. Elsewhere, `lsof -nP -iTCP:<port> -sTCP:LISTEN -t`, then
  `lsof -a -p <pid> -d cwd -Fn`. A server from another checkout answers with that checkout's
  code.
- **Which build:** `next dev` serves the working tree. A preview serves the build it made: compare
  the page's release meta with `git rev-parse HEAD`, and rebuild after changing app code.

Open `localhost`, not `127.0.0.1`: mixing the two drops the session cookie. A new checkout needs
`pnpm install && pnpm run setup` first. More in `docs/agents/development-environment.md`, Run.

## 3. Sign in

Seeded users share the password `password123`: `admin@test.com` is Pro, and `john@test.com` is
Free and a member of the seeded Organizations (`docs/agents/development-environment.md`, Sign
in). Under `pnpm run dev:all`, `/login/` has quick-fill buttons; the preview has none, so
`fill_form` the email and password and click **Sign in**.

## 4. Reproduce first

For a bug, open the failing page before changing code, and keep the evidence in the run's folder:

- `take_screenshot` and `take_snapshot` with a `filePath`.
- A recording: `screencast_start` with a `filePath` ending in `.webm` or `.mp4`, go through the
  steps, then `screencast_stop`. It needs ffmpeg on the PATH, and records only frames where the
  page changes, so start it before the steps.

After the fix, record the same steps again, so the pull request shows both.

## 5. Check the change

For each page the change touches:

1. `navigate_page` to its URL. Page URLs end in a slash (`/dashboard/templates/`); a URL without
   it only tests the redirect.
2. `take_snapshot` reads the accessibility tree: check text, headings, labels, links and order
   there rather than guessing from a screenshot. Its `uid`s are what `click`, `fill`, `fill_form`
   and `hover` act on; `wait_for` the text that shows the result. Leaving a page with unsaved
   changes opens the browser's confirm dialog: answer it with `handle_dialog`.
3. `take_screenshot` checks layout at desktop and phone widths. Set the width with `emulate`
   (`viewport` `"1440x900x1"`, or `"390x844x3,mobile,touch"` for a phone), then reload. Avoid
   `resize_page`: a tab it resized in a headless session stopped receiving clicks.
4. `list_console_messages`: no errors. A hydration error (React #418 or #423) means the server's
   HTML differs from the first render, usually because something read `window`, the time or
   storage while rendering (`src/hooks/useIsClient.ts` defers that).
5. `list_network_requests`: no failed requests. `get_network_request` on an API call shows its
   `x-request-id`, which the `debug-api` skill finds in the server's log.
6. Compare what you see with the behavior's entry in `docs/product/`. A difference with no
   decision on file is a bug; a deliberate change updates the entry in the same pull request.

On the preview, also check what only the production build does, with `get_network_request` on
the page's document request: a URL without its slash answers `308` to the canonical URL,
prerendered pages carry `x-opennext-cache: HIT`, and every response has the security headers and,
as a non-production site, `X-Robots-Tag: noindex, nofollow`. Measure speed there, never on
`next dev`: `performance_start_trace`, `performance_stop_trace` and `performance_analyze_insight`,
or `lighthouse_audit`, and say which build you measured.

## 6. Clean up, then report

Stop only what this run started: `pnpm run dev:stop` for a `dev:all` it started (killing it leaves
Next.js and workerd holding the port on Windows), and a preview's whole process tree
(`taskkill /PID <pid> /T /F` on Windows). Leave a server you found running.

Report which URLs, widths, build and user you checked, what the snapshot showed for the behavior
you changed, whether the console and network were clean, and the run's folder. A check you
couldn't run is reported as not run, not as passed.

## Setup

- `.claude/settings.json` enables the server for this repository, and `npx` downloads the pinned
  version on first use. Chrome must be installed, and recording needs ffmpeg
  (`winget install ffmpeg`, `brew install ffmpeg`).
- No display (a cloud or CI agent): add `--headless` with a local override from the repository
  root, which Claude Code prefers to the project's entry:
  `claude mcp add chrome-devtools --scope local -- npx -y chrome-devtools-mcp@1.10.1 --isolated --headless --experimental-screencast --no-usage-statistics --no-performance-crux`
