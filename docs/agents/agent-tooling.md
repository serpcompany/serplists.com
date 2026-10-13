# Agent tooling

The Claude Code configuration everyone shares is committed, so every checkout and worktree starts
with the same tools, hooks and permissions: `.claude/settings.json`, `.mcp.json` and
`.claude/skills/`. Personal settings go in a `settings.local.json` beside the shared one, which git
ignores, such as the auto-compact window for a session that runs subagents.

## Worktrees

Claude Code puts a subagent's worktree in `worktrees` inside the `.claude` folder of the main
checkout. Git, Vitest, ESLint and the template source check ignore that folder (`.gitignore`,
`vitest.config.ts`, `eslint.config.ts`, `scripts/check-template-sources.ts`), so the main
checkout's tests, lint and checks never pick up an agent's copy of the repository while it works.

A worktree has its own ports (`pnpm run ports`), local D1, build and Chrome profile
([`verification.md`](verification.md#this-checkouts-ports)). Scratch files go in
`tmp/agent/scratch/`, which housekeeping empties, and proof in `tmp/agent/verify/`, which it keeps
(`.housekeeping`).

## Chrome (`.mcp.json`)

The `chrome-devtools` MCP server
([chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp), pinned to an exact
version) lets an agent drive the app in Chrome: open pages, read the accessibility tree, click and
type, take screenshots, record video, and read the console, network requests and performance
traces. It starts its own Chrome with a temporary profile (`--isolated`) when a tool first needs
one, and sends no usage statistics or CrUX lookups. `enabledMcpjsonServers` in
`.claude/settings.json` turns it on for every session, so nobody approves it by hand, and it is the
only server: each one costs context on every turn. `npx` starts it on Windows too, without a
`cmd /c` wrapper.

Recording (`--experimental-screencast`) needs ffmpeg on the PATH, and the server needs Chrome:
both are installed per person, which [`harness-debt.md`](../harness-debt.md) records. To upgrade the
server, change its version in `.mcp.json` and in the `verify-web` skill's setup line together.

## Hooks

`.claude/settings.json` runs the checks where an agent works ([`code.md`](code.md#checks)):

- **The edit hook** (`PostToolUse` on `Write`, `Edit` and `MultiEdit`) runs
  `tools/checks/hook.mjs` on each file Claude Code writes, and gives a failure back to the agent.
  `onFailure: "block"` makes a hook that crashes or times out report too, rather than let
  everything through.
- **The stop hook** (`Stop`) runs `tools/checks/stop-hook.mjs` on the files changed since the last
  commit before a turn ends, the docs check included, and catches a file a shell command rewrote.
  It blocks a turn once and never loops, and reports a failure once until a turn ends clean, so
  one that comes back is reported again; it keeps the default on a crash, since a broken stop hook
  would hold every turn open.

Both find the checkout from their input rather than `CLAUDE_PROJECT_DIR`, which stays where the
session started, so they check a worktree's own files. Claude Code reads hooks when a session
starts: a change to them takes effect in the next session. The Claude jobs in CI run no hooks
(`--settings '{"disableAllHooks":true}'`): a hook runs a script from the checkout, which on a pull
request is the pull request's own, with the job's tokens in its environment
([`ci-agents.md`](ci-agents.md#code-review)).

## Skills

The repository's skills are in `.claude/skills/`, each a `SKILL.md` whose frontmatter `name` is its
folder's and whose `description` says when to use it. The Skills table in
[`code.md`](code.md#skills) lists them; `pnpm run verify docs` fails a skill missing from it or
with bad frontmatter. A skill's commands ship as a script beside it, as
`.claude/skills/verify-api/run.ts` does, tested like other code
(`tests/unit/skills/verify-api-run.test.ts`).

SERP's own skills (`serp-housekeeping`, `serp-standards`, `serp-orchestrate`, `serp-agent-docs`,
`serp-verify-setup`) carry the standards to every repository, installed once per machine with
`npx skills add serpcompany/serp -g --skill '*'`. The docs here point to them and never restate
them.

## Permissions

`.claude/settings.json` denies what a session never does and asks before anything that leaves the
machine with effect. The owner's rule: ask before commands that affect real deployments or
databases, Cloudflare, D1, R2, Stripe, GitHub merges and workflow runs; anything local, an agent
may do freely.

- **Denied:** `rg`, which crashes VS Code here by starting hundreds of processes (use `grep` and
  `find`); and `ssh`, `scp`, `sftp` and `rsync`, since a session never reaches a server: deploys
  run from CI.
- **Asked, Cloudflare:** every Wrangler command that changes the account. The owner's Wrangler
  login reaches the whole account, every other project on it included. That is deploys, version
  uploads and deploys, rollbacks and `delete`; secrets (`secret`, `versions secret`, the Secrets
  Store); anything with `--remote`; and what acts on Cloudflare without it: `d1 create`,
  `d1 delete` and `d1 time-travel`, every `r2 bucket` subcommand, `kv namespace`, `triggers`,
  `pages`, and the services this repository doesn't use (Queues, Workflows, Email, Hyperdrive,
  Vectorize, AI, Pipelines, dispatch namespaces, Containers, certificates, tunnels, Turnstile,
  VPC, Flagship, Artifacts, Agent Memory, previews and Browser Rendering). OpenNext's `deploy`,
  `upload`, `populateCache remote` and `--remote` too.
- **Asked, scripts and Stripe:** the package scripts that reach Staging, Production, Cloudflare or
  Stripe (`*:staging*`, `*:prod*`, `*:remote*` and `stripe:portal:configure`), through `pnpm` or
  `npm`; a script run with `--remote` or `--allow-production` through `node`, `npx`, `pnpm`,
  `pnpx` or `tsx`; `scripts/stripe/configure-portal.ts` however it starts; and `stripe` with
  `--live`.
- **Asked, pushes:** a `git push` that names `staging` or `main` as where it goes (or a branch
  whose name starts with either): `origin main`, `HEAD:staging`, `+main`, `refs/heads/main`,
  `--delete staging`. A push to either deploys it.
- **Asked, GitHub:** `gh pr merge`, since agents never merge; `gh workflow run`, `enable` and
  `disable`, and `gh run rerun` and `cancel`, which start or stop deploys; `gh secret`,
  `gh variable set` and `delete`; `gh repo edit`, `delete`, `archive` and `rename`;
  `gh run delete`; and every `gh api` write (`-X`, `--method`, `-f`, `-F`, `--field`,
  `--raw-field`, `--input`, `graphql`).
- **Free:** everything local, and every read: `--local` D1 commands and the package scripts that
  run them, `wrangler types`, `dev` and `tail`, OpenNext's `build` and `preview`, `gh` reads, and
  `git push` of any other branch.

Each rule starts with the program it guards, in Bash and in PowerShell. Started the ways this
repository starts them (bare, `npx` with or without `-y`, `pnpm`, `pnpm exec`), Wrangler and
OpenNext ask only for the commands above. Started any other way, they ask for every command, since
that runs a copy that isn't the project's own: a pinned version (`npx wrangler@<version>`),
`pnpm dlx` and `pnpx`, or a path into `node_modules`. `npm exec`, `npm x`, `yarn`, `bunx` and
`bun`, which this repository doesn't use, ask for every command whatever they start. None starts
with a wildcard, which would match a search or a comment that mentions a command. A rule matches
the command as written, so it guards against accidents and is not a security boundary:
credentials that could do damage stay out of agent sessions, and the escalation rules in
[`code.md`](code.md#what-needs-the-owner) still hold.

## CI loads the same settings

The Claude jobs in [`ci-agents.md`](ci-agents.md) run in the checkout with these permissions but
without the hooks, and in CI an ask can't prompt, so it denies. The settings therefore never deny
or ask for a tool those jobs use: `git` (their commits, and pushes to their own branches; `@claude`
pushes through the action's own script), `gh pr view`, `diff` and `create`, `gh issue view`,
`pnpm run check` and `verify`, `pnpm exec tsc` and `vitest`, and the Read, Write, Edit, Grep and
Glob tools. A deny on the Grep tool would take it from them; to keep the Grep tool,
which runs ripgrep, out of your own sessions, deny it in your `settings.local.json`. The jobs
pass `--strict-mcp-config`, so the Chrome server never starts in CI.

`tests/unit/config/agent-tooling.test.ts` holds all of this: every package script that reaches
Staging, Production, Cloudflare or Stripe is asked, through any package manager; every
Cloudflare, GitHub and Stripe command above, and every push to `staging` or `main`, is asked
however it starts; nothing any of the three agent workflows allows or runs is denied or asked;
the hooks are as above; the servers `.claude/settings.json` enables are `.mcp.json`'s; and the
`verify-web` skill names the same server version.
