# Agent tooling

The Claude Code configuration everyone shares is committed, so every checkout and worktree
starts with the same tools. Personal settings go in `.claude/settings.local.json`, which git
ignores.

Claude Code puts a sub-agent's worktree in `.claude/worktrees/`, inside the main checkout.
Git, Vitest, ESLint and the template source check ignore that folder (`.gitignore`,
`vitest.config.ts`, `eslint.config.ts`, `scripts/check-template-sources.ts`), so tests, lint and
`pnpm run verify` in the main checkout never pick up an agent's copy of the repository while it
works.

- **Chrome (`.mcp.json`):** the `chrome-devtools` MCP server
  ([chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp), pinned to an
  exact version) lets an agent drive the app in Chrome: open pages, read the accessibility
  tree, click and type, take screenshots, record video, and read the console, network
  requests, and performance traces. It starts its own Chrome with a temporary profile
  (`--isolated`) when a tool first needs one, and sends no usage statistics or CrUX lookups.
  Recording (`--experimental-screencast`) needs ffmpeg on the PATH; without it only the
  recording tools fail. Claude Code asks each person once per checkout to approve the server.
  `npx` starts it on Windows too, without a `cmd /c` wrapper (checked with Claude Code
  2.1.284). To upgrade, change the version in `.mcp.json` and in the `verify-web` skill's
  setup line; a test checks that they match.
- **Skills (`.claude/skills/`):** instructions Claude loads when a task matches a skill's
  description, or when you type `/<name>`. They point to the docs rather than repeat them.
  To add one, create `.claude/skills/<name>/SKILL.md` with `name` and `description`
  frontmatter and list it here.

  | Skill | Use it to |
  | --- | --- |
  | [verify-web](../../.claude/skills/verify-web/SKILL.md) | Run the app and check a change or reproduce a UI bug in Chrome, with screenshots and before-and-after recordings |
  | [debug-api](../../.claude/skills/debug-api/SKILL.md) | Find a request's server log lines by its `X-Request-Id`, look at local D1 data, and measure D1 rows read |
  | [browser-tests](../../.claude/skills/browser-tests/SKILL.md) | Pick the smallest Playwright run, read a failure, and write specs the way this repository does |
  | [pr-review](../../.claude/skills/pr-review/SKILL.md) | Review a PR for bugs and rule breaches, post new findings inline, and keep one summary comment current; the CI review runs it on every push |

- **Permissions (`.claude/settings.json`):** Claude asks before commands that reach staging,
  production, Cloudflare, or live Stripe: wrangler with `--remote`, the `*:staging`,
  `*:prod`, and `*:remote` package scripts, deploys, version uploads, rollbacks, Worker
  deletion, secrets, `stripe:portal:configure`, and `stripe` with `--live`. `rg` is denied,
  since it crashes VS Code. Each rule starts with the command it guards (`wrangler`,
  `npx wrangler`, `pnpm wrangler`, `pnpm exec wrangler`, the same four for
  `opennextjs-cloudflare`, and `pnpm` for the package scripts), never with a wildcard: a
  leading `*` matches text anywhere in a command, so a search for "wrangler deploy" or a
  review comment that mentions one would trip it. Every Bash rule has a PowerShell twin. The
  rules match the commands agents usually write, not every way to run a program, so they
  back the [escalation rules](../../AGENTS.md#escalate-to-a-human) rather than replace them.
- **CI loads the same settings:** the Claude jobs in [Claude code review](ci-agents.md#claude-code-review)
  and [Weekly maintenance](ci-agents.md#weekly-maintenance) run in the checkout, and on pull requests
  the action restores these files from the base branch. There an ask rule cannot prompt,
  so it denies: the review's guard names any denied tool and fails when the review posted
  nothing, and the gardening job could not push its branch. A deny on the Grep or Glob
  tools would take them from both jobs. The settings therefore never deny or ask for what
  those jobs use: `git push`, `gh`, and the Grep and Glob tools. To keep the Grep tool
  (built on ripgrep) out of your own sessions, deny it in `.claude/settings.local.json`.
  Both jobs pass `--strict-mcp-config`, so the `chrome-devtools` server in `.mcp.json`
  never starts in CI. `tests/unit/config/agent-tooling.test.ts` checks both directions:
  every package script that reaches staging, production, Cloudflare, or Stripe is asked,
  and nothing the CI jobs run, or merely mention, is.
- **Checks:** `pnpm run docs:check` covers the skills as it does the docs: links and
  repository paths resolve, every `pnpm run` names a script in `package.json`, and each skill
  is named after its folder, has a description, and is listed above.
