import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { allowedTools, claudeStep, CLAUDE_WORKFLOWS, parseRule, readWorkflow, ruleMatches, stepsOf } from '../../support/claudeWorkflows';
import { capturedGroup, present, valueAt } from '../../support/elements';

const repoRoot = process.cwd();
const readText = (file: string) => readFileSync(path.join(repoRoot, file), 'utf8');

const hookCommandSchema = z
  .object({ type: z.string(), command: z.string(), timeout: z.number().optional(), onFailure: z.string().optional() })
  .strict();
const hookGroupSchema = z.object({ matcher: z.string().optional(), hooks: z.array(hookCommandSchema) }).strict();
const settings = z
  .object({
    enabledMcpjsonServers: z.array(z.string()),
    hooks: z.object({ PostToolUse: z.array(hookGroupSchema), Stop: z.array(hookGroupSchema) }).strict(),
    permissions: z.object({ deny: z.array(z.string()), ask: z.array(z.string()) }).strict(),
  })
  .parse(JSON.parse(readText('.claude/settings.json')));
const packageScripts = z
  .object({ scripts: z.record(z.string()) })
  .parse(JSON.parse(readText('package.json'))).scripts;
const mcpServers = z
  .object({ mcpServers: z.record(z.object({ command: z.string(), args: z.array(z.string()) })) })
  .parse(JSON.parse(readText('.mcp.json'))).mcpServers;

const denyRules = settings.permissions.deny.map(parseRule);
const askRules = settings.permissions.ask.map(parseRule);

const SHELLS = ['Bash', 'PowerShell'];

const withoutLeadingVariableAssignments = (command: string) =>
  command.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '');

const decision = (tool: string, command: string) => {
  const commands = [command, withoutLeadingVariableAssignments(command)];
  if (denyRules.some((rule) => commands.some((text) => ruleMatches(rule, tool, text)))) return 'deny';
  if (askRules.some((rule) => commands.some((text) => ruleMatches(rule, tool, text)))) return 'ask';
  return 'default';
};

const undecidedIn = (commands: readonly string[], expected: 'ask' | 'deny' | 'default') =>
  commands.flatMap((command) =>
    SHELLS.filter((shell) => decision(shell, command) !== expected).map((shell) => `${shell}: ${command}`),
  );

const REMOTE_COMMAND =
  /--remote\b|--preview\b|--allow-production\b|--label (?:production|staging)\b|wrangler (?:deploy|secret|versions|rollback|delete|triggers|pages|r2 bucket|kv namespace|d1 (?:create|delete|time-travel))\b|opennextjs-cloudflare (?:deploy|upload|populateCache remote)\b|scripts\/stripe\/configure-portal/;
const remoteScripts = Object.entries(packageScripts)
  .filter(([name, command]) => REMOTE_COMMAND.test(command) || /:(?:staging|prod|remote)\b/.test(name))
  .map(([name]) => name);

const WRANGLER_STARTS = [
  'wrangler',
  'npx wrangler',
  'npx -y wrangler',
  'npx wrangler@4.143.0',
  'npx --yes wrangler@4',
  'pnpm wrangler',
  'pnpm exec wrangler',
  'pnpm dlx wrangler',
  'pnpm dlx wrangler@4.143.0',
  'pnpx wrangler',
  'pnpx wrangler@4',
  './node_modules/.bin/wrangler',
  'node_modules/.bin/wrangler',
  'node node_modules/wrangler/bin/wrangler.js',
  'npm exec wrangler --',
  'npm x wrangler',
  'yarn wrangler',
  'yarn dlx wrangler@4',
  'bunx wrangler',
  'bun x wrangler',
];

const WRANGLER_COMMANDS_THAT_CHANGE_CLOUDFLARE = [
  'deploy --env production',
  'versions upload --env preview',
  'versions deploy',
  'versions secret put STRIPE_SECRET_KEY --env production',
  'rollback',
  'delete --env preview',
  'secret put BETTER_AUTH_SECRET --env production',
  'secret bulk secrets.json',
  'triggers deploy --env production',
  'd1 create serp-checklists-db-copy',
  'd1 delete serp-checklists-db',
  'd1 time-travel restore serp-checklists-db --timestamp=2026-10-01T00:00:00Z',
  'd1 execute serp-checklists-db --remote --command "SELECT 1"',
  'd1 execute serp-checklists-db --remote --command "DELETE FROM users"',
  'd1 migrations apply DB --remote --preview',
  'd1 export serp-checklists-db --remote --output tmp/backups/production.sql',
  'r2 bucket create serp-checklists-staging-uploads',
  'r2 bucket delete serp-checklists-uploads',
  'r2 bucket lifecycle add serp-checklists-uploads expire-tmp tmp/ --expire-days 7',
  'r2 bucket cors set serp-checklists-uploads --file cors.json',
  'r2 object put serp-checklists-uploads/example.txt --file example.txt --remote',
  'kv namespace create CACHE',
  'kv namespace delete --namespace-id 0f2ac74b498b48028cb68387c421e279',
  'kv key put --binding CACHE greeting hello --remote',
  'pages deploy .open-next/assets --project-name serp-checklists',
  'pages project delete serp-checklists',
  'queues create run-events',
  'workflows trigger publish-template',
  'email sending enable serplists.com',
  'hyperdrive delete 0f2ac74b',
  'vectorize create templates --dimensions 768 --metric cosine',
  'ai-search create templates',
  'ai finetune create @cf/meta/llama-3-8b templates ./data',
  'secrets-store secret create 0f2ac74b --name STRIPE_SECRET_KEY',
  'pipelines create run-events',
  'dispatch-namespace create customers',
  'containers push serplists:latest',
  'cloudchamber apply',
  'cert upload certificate-authority --ca-cert ca.pem',
  'mtls-certificate upload --cert cert.pem --key key.pem',
  'tunnel create serplists',
  'turnstile widget create serplists',
  'vpc service create internal',
  'flagship flags set new-editor true',
  'artifacts repos create templates',
  'agent-memory namespace create agents',
  'preview delete',
  'browser create',
];

const OPEN_NEXT_STARTS = [
  'opennextjs-cloudflare',
  'npx opennextjs-cloudflare',
  'npx @opennextjs/cloudflare',
  'npx @opennextjs/cloudflare@1.20.7',
  'pnpm opennextjs-cloudflare',
  'pnpm exec opennextjs-cloudflare',
  'pnpm dlx @opennextjs/cloudflare@1.20.7',
  'pnpx @opennextjs/cloudflare',
  './node_modules/.bin/opennextjs-cloudflare',
  'node_modules/.bin/opennextjs-cloudflare',
  'npm exec @opennextjs/cloudflare --',
  'yarn opennextjs-cloudflare',
  'bunx @opennextjs/cloudflare',
];

const OPEN_NEXT_COMMANDS_THAT_CHANGE_CLOUDFLARE = ['deploy', 'upload --env preview', 'populateCache remote', 'preview --remote'];

const PUSHES_TO_STAGING_OR_MAIN = [
  'git push origin main',
  'git push origin staging',
  'git push -u origin staging',
  'git push origin HEAD:staging',
  'git push origin HEAD:main',
  'git push origin feat/12-run-keys:main',
  'git push upstream chore/doc-gardening-2026-10-12:staging',
  'git push --force origin main',
  'git push -f origin staging',
  'git push origin main --force',
  'git push --force-with-lease origin HEAD:main',
  'git push origin +main',
  'git push origin +HEAD:staging',
  'git push origin HEAD:refs/heads/main',
  'git push origin --delete staging',
  'git push origin :main',
];

const claudeAction = present(claudeStep(stepsOf(readWorkflow('.github/workflows/claude.yml'), 'claude')).step.uses, "claude.yml's action");
const actionPath = `/home/runner/work/_actions/${claudeAction.replace('@', '/')}`;

describe('.claude/settings.json', () => {
  it('asks before every package script that reaches staging, production, Cloudflare or Stripe, through any package manager', () => {
    expect(remoteScripts).toEqual(expect.arrayContaining(['db:migrate:d1:prod', 'db:migrate:d1:staging', 'stripe:portal:configure']));
    const runs = remoteScripts.flatMap((name) => [`pnpm run ${name}`, `pnpm ${name}`, `npm run ${name}`, `yarn ${name}`, `yarn run ${name}`, `bun run ${name}`]);
    expect(undecidedIn(runs, 'ask')).toEqual([]);
  });

  it.each(WRANGLER_COMMANDS_THAT_CHANGE_CLOUDFLARE)('asks before wrangler %s, however wrangler is started', (command) => {
    expect(undecidedIn(WRANGLER_STARTS.map((start) => `${start} ${command}`), 'ask')).toEqual([]);
  });

  it.each(OPEN_NEXT_COMMANDS_THAT_CHANGE_CLOUDFLARE)('asks before opennextjs-cloudflare %s, however it is started', (command) => {
    expect(undecidedIn(OPEN_NEXT_STARTS.map((start) => `${start} ${command}`), 'ask')).toEqual([]);
  });

  it.each([
    'npx wrangler@4.143.0 types',
    'pnpm dlx wrangler@4.143.0 d1 execute serp-checklists-db --local --command "SELECT 1"',
    'pnpx wrangler types',
    './node_modules/.bin/wrangler types',
    'node node_modules/wrangler/bin/wrangler.js types',
    'npm exec wrangler -- types',
    'pnpm dlx @opennextjs/cloudflare@1.20.7 build',
    'node_modules/.bin/opennextjs-cloudflare build',
    'yarn install',
    'bunx wrangler types',
    'bun run build',
  ])('asks before %s: a downloaded or path-started Wrangler or OpenNext, npm exec, yarn and bun ask for every command', (command) => {
    expect(undecidedIn([command], 'ask')).toEqual([]);
  });

  it.each(PUSHES_TO_STAGING_OR_MAIN)('asks before %s: a push to staging or main deploys it', (command) => {
    expect(undecidedIn([command], 'ask')).toEqual([]);
  });

  it.each([
    'CLOUDFLARE_ACCOUNT_ID=abc123 npx wrangler d1 migrations apply serp-checklists-db --remote',
    'node scripts/d1-baseline-migrations.mjs --remote --database serp-checklists-db --allow-production',
    'node --import tsx scripts/d1-baseline-migrations.ts --remote --database DB --preview',
    'node --import tsx scripts/d1-baseline-migrations.ts --allow-production',
    'npx tsx scripts/d1-baseline-migrations.ts --remote --database serp-checklists-db --allow-production',
    'pnpm exec tsx scripts/d1-baseline-migrations.ts --remote --allow-production',
    'pnpx tsx scripts/d1-baseline-migrations.ts --allow-production',
    'tsx scripts/d1-baseline-migrations.ts --remote --database DB',
    'node --import tsx scripts/stripe/configure-portal.ts',
    'npx tsx scripts/stripe/configure-portal.ts',
    'pnpm exec tsx scripts/stripe/configure-portal.ts',
    'stripe products list --live',
    'gh pr merge 7 --squash',
    'gh pr merge 7 --auto --squash',
    'gh workflow run maintenance.yml',
    'gh workflow disable claude.yml --repo serpcompany/serplists.com',
    'gh workflow enable claude.yml',
    'gh run rerun 38262303273',
    'gh run cancel 38262303273',
    'gh run delete 38262303273',
    'gh secret set CLAUDE_CODE_OAUTH_TOKEN',
    'gh variable set DEPLOY_PRODUCTION --body false',
    'gh variable delete DEPLOY_PRODUCTION',
    'gh repo edit serpcompany/serplists.com --default-branch staging',
    'gh repo delete serpcompany/serplists.com --yes',
    'gh repo archive serpcompany/serplists.com',
    'gh repo rename serplists',
    'gh api -X PATCH repos/serpcompany/serplists.com -F allow_update_branch=true',
    'gh api -XPUT repos/serpcompany/serplists.com/environments/production',
    'gh api --method=PATCH repos/serpcompany/serplists.com/branches/staging/protection/required_status_checks',
    'gh api --method PUT repos/serpcompany/serplists.com/pulls/7/merge',
    'gh api -X DELETE repos/serpcompany/serplists.com/labels/sesh',
    'gh api repos/serpcompany/serplists.com/issues -f title=Hello',
    'gh api repos/serpcompany/serplists.com/labels -F name=brainstorm',
    'gh api repos/serpcompany/serplists.com/issues --field title=Hello',
    'gh api repos/serpcompany/serplists.com/issues --raw-field title=Hello',
    'gh api repos/serpcompany/serplists.com/rulesets --input ruleset.json',
    'gh api repos/serpcompany/serplists.com/pulls/7/reviews --input tmp/review.json',
    'gh api repos/serpcompany/serplists.com/actions/workflows/ci.yml/dispatches -f ref=staging',
    'gh api graphql -f query="mutation { mergePullRequest(input: {pullRequestId: \\"x\\"}) { clientMutationId } }"',
  ])('asks before %s', (command) => {
    expect(undecidedIn([command], 'ask')).toEqual([]);
  });

  it.each([
    'gh pr comment 7 --body "Run npx wrangler deploy --remote after this merges"',
    'gh pr comment 7 --body "This adds a wrangler secret put step"',
    'gh issue comment 12 --body "Ask the owner before gh pr merge"',
    'grep -rn "wrangler deploy" scripts docs',
    'git commit -m "docs: explain npx wrangler d1 migrations apply --remote"',
    'git commit -m "chore: never git push origin main from a session"',
  ])('lets %s through: it only mentions such a command, and in CI an ask rule would deny it', (command) => {
    expect(undecidedIn([command], 'default')).toEqual([]);
  });

  it.each([
    'pnpm run dev:all',
    'pnpm run dev',
    'pnpm run db:migrate:d1:local',
    'pnpm run db:query "SELECT email FROM users LIMIT 5"',
    'npx wrangler d1 execute serp-checklists-db --local --command "SELECT email FROM users"',
    'npx wrangler d1 migrations apply serp-checklists-db --local',
    'npx wrangler d1 migrations create serp-checklists-db add_runs_index',
    'npx wrangler r2 object get serp-checklists-uploads/example.txt --local',
    'npx wrangler tail serp-checklists-preview --format json',
    'pnpm exec wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts',
    'pnpm exec opennextjs-cloudflare build',
    'pnpm exec opennextjs-cloudflare preview --port 8787',
    'pnpm dlx shadcn@latest add button',
    'npm view wrangler version',
    'pnpm run preview',
    'pnpm run build:worker',
    'pnpm run test:e2e:full tests/e2e/templates.spec.ts',
    'pnpm run stripe:local:listen',
    'pnpm run verify',
    'pnpm run check',
    'node tools/checks/ports.mjs prune',
    'gh pr view 7 --comments',
    'gh pr checks 7',
    'gh run view 38262303273 --log-failed',
    'gh run download 38262303273 -n playwright-evidence',
    'gh api repos/serpcompany/serplists.com/pulls/7/comments',
    'gh api repos/serpcompany/serplists.com/actions/runs --jq ".workflow_runs[0].status"',
    'gh label list --limit 200',
    'git push -u origin issue-12-run-key-limits',
    'git push origin feat/12-main-menu',
    'git push -u origin fix/31-custom-domain',
    'git push origin HEAD:feat/12-run-keys',
    'git push --force-with-lease origin feat/12-run-keys',
    'grep -rn "remote" package.json',
  ])('runs %s without asking: it changes nothing outside this machine', (command) => {
    expect(undecidedIn([command], 'default')).toEqual([]);
  });

  it.each(['rg "useAuth" src', 'rg', 'ssh deploy@example.com', 'scp dump.sql deploy@example.com:', 'sftp deploy@example.com', 'rsync -a tmp/ deploy@example.com:tmp/'])(
    'denies %s: rg crashes VS Code here, and a session never reaches a server by SSH',
    (command) => {
      expect(undecidedIn([command], 'deny')).toEqual([]);
    },
  );

  it('starts no rule with a wildcard, which would match inside other commands', () => {
    expect([...denyRules, ...askRules].filter((rule) => rule.pattern?.startsWith('*'))).toEqual([]);
  });

  it('gives every Bash rule a PowerShell twin', () => {
    for (const rules of [denyRules, askRules]) {
      const patterns = (tool: string) => rules.filter((rule) => rule.tool === tool).map((rule) => rule.pattern);
      expect(patterns('PowerShell')).toEqual(patterns('Bash'));
    }
  });
});

const claudeJobs = readdirSync(path.join(repoRoot, '.github/workflows'))
  .filter((name) => /\.ya?ml$/.test(name))
  .sort()
  .map((name) => `.github/workflows/${name}`)
  .flatMap((file) =>
    Object.values(readWorkflow(file).jobs)
      .flatMap((job) => job.steps ?? [])
      .filter((step) => step.uses?.startsWith('anthropics/claude-code-action'))
      .map((step) => ({ file, tools: allowedTools(step) })),
  );

describe('the CI Claude jobs under .claude/settings.json', () => {
  const readOnlyToolsNeedingNoAllowRule = ['Read', 'Glob', 'Grep'];
  const tools = [...new Set([...claudeJobs.flatMap((job) => job.tools), ...readOnlyToolsNeedingNoAllowRule])];

  it('are found in every workflow that runs Claude: the review, @claude, and both gardeners', () => {
    expect([...new Set(claudeJobs.map((job) => job.file))]).toEqual(CLAUDE_WORKFLOWS);
    expect(claudeJobs.filter((job) => job.file.endsWith('maintenance.yml'))).toHaveLength(2);
  });

  it('are neither denied nor asked about a tool they are allowed', () => {
    const blocked = tools.filter((tool) => {
      const rule = parseRule(tool);
      if (rule.pattern === null) return [...denyRules, ...askRules].some((other) => other.tool === rule.tool);
      return decision(rule.tool, rule.pattern.replace(/(?::| )\*$/, '').replaceAll('*', 'x')) !== 'default';
    });
    expect(blocked).toEqual([]);
  });

  it.each([
    'git add docs/agents/verification.md',
    'git commit -m "docs: weekly doc gardening (2026-10-12)"',
    'git push -u origin chore/doc-gardening-2026-10-12',
    'git push -u origin chore/code-gardening-2026-10-12',
    'git push origin HEAD:chore/code-gardening-2026-10-12',
    `${actionPath}/scripts/git-push.sh origin HEAD`,
    `${actionPath}/scripts/git-push.sh origin claude/issue-12-20261012-1400`,
    'gh pr create --base staging --title "docs: weekly doc gardening (2026-10-12)" --body-file tmp/pr-body.md',
    'gh pr view 7 --json title,body,headRefOid,baseRefName',
    'gh pr diff 7',
    'gh issue view 12 --json title,body,comments',
    'pnpm run verify',
    'pnpm run verify docs',
    'pnpm run verify comments,sizes docs/agents',
    'pnpm run check',
    'pnpm exec tsc -p tsconfig.node.json --noEmit',
    'pnpm exec vitest related --run scripts/maintenance-report.ts',
  ])('let a CI job run %s', (command) => {
    expect(decision('Bash', command)).toBe('default');
  });
});

describe('the hooks in .claude/settings.json', () => {
  it('check each file an agent writes, and say so when the hook itself breaks', () => {
    expect(settings.hooks.PostToolUse).toEqual([
      {
        matcher: 'Write|Edit|MultiEdit',
        hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/tools/checks/hook.mjs"', timeout: 30, onFailure: 'block' }],
      },
    ]);
  });

  it('check the whole change before a turn ends, without holding the turn when the hook breaks', () => {
    expect(settings.hooks.Stop).toEqual([
      { hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/tools/checks/stop-hook.mjs"', timeout: 120 }] },
    ]);
  });

  it('run scripts the checkout has', () => {
    const scripts = [...settings.hooks.PostToolUse, ...settings.hooks.Stop].flatMap((group) =>
      group.hooks.map((hook) => capturedGroup(/\$CLAUDE_PROJECT_DIR\/([^"]+)"/.exec(hook.command), 1)),
    );
    expect(scripts.filter((script) => !existsSync(path.join(repoRoot, script)))).toEqual([]);
  });
});

describe('.mcp.json', () => {
  it('pins every npx server to an exact version', () => {
    for (const [name, server] of Object.entries(mcpServers)) {
      if (server.command !== 'npx') continue;
      const spec = server.args.find((arg) => !arg.startsWith('-'));
      expect(spec, name).toMatch(/^(?:@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+$/);
    }
  });

  it('is enabled for every session by .claude/settings.json, server by server', () => {
    expect([...settings.enabledMcpjsonServers].sort()).toEqual(Object.keys(mcpServers).sort());
  });

  it('gives Chrome a temporary profile, and verify-web the same server and version for machines without a display', () => {
    const chrome = valueAt(mcpServers, 'chrome-devtools');
    expect(chrome.args).toContain('--isolated');
    const skill = readText('.claude/skills/verify-web/SKILL.md');
    const override = capturedGroup(/claude mcp add chrome-devtools --scope local -- ([^`\n]+)/.exec(skill), 1).trim().split(/\s+/);
    expect(override[0]).toBe(chrome.command);
    expect(override.slice(1).sort()).toEqual([...chrome.args, '--headless'].sort());
  });
});
