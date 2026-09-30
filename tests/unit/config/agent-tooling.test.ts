import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// The shared Claude Code configuration (docs/design-docs/agent-workflow.md#agent-tooling).
// .claude/settings.json asks before commands that reach staging, production, Cloudflare, or
// live Stripe, backing the escalation rules in AGENTS.md. The CI Claude jobs run in the same
// checkout with the same settings, where an ask rule cannot prompt and so denies, so the
// settings must leave alone every tool those jobs use.

const repoRoot = process.cwd();
const readText = (file: string) => readFileSync(path.join(repoRoot, file), 'utf8');

const permissions = z
  .object({ permissions: z.object({ deny: z.array(z.string()), ask: z.array(z.string()) }) })
  .parse(JSON.parse(readText('.claude/settings.json'))).permissions;
const packageScripts = z
  .object({ scripts: z.record(z.string()) })
  .parse(JSON.parse(readText('package.json'))).scripts;
const mcpServers = z
  .object({ mcpServers: z.record(z.object({ command: z.string(), args: z.array(z.string()) })) })
  .parse(JSON.parse(readText('.mcp.json'))).mcpServers;

type Rule = { tool: string; pattern: string | null };

const parseRule = (rule: string): Rule => {
  const match = /^([\w-]+)(?:\((.*)\))?$/.exec(rule);
  if (!match) throw new Error(`Unexpected permission rule: ${rule}`);
  return { tool: match[1], pattern: match[2] ?? null };
};

const denyRules = permissions.deny.map(parseRule);
const askRules = permissions.ask.map(parseRule);

// Claude Code's matching for Bash and PowerShell rules (https://code.claude.com/docs/en/permissions):
// `*` stands for any text, a trailing ` *` (or `:*`) that is the rule's only wildcard also
// matches the bare command, and PowerShell compares without case.
const ruleMatches = (rule: Rule, tool: string, command: string) => {
  if (rule.tool !== tool) return false;
  if (rule.pattern === null) return true;
  const pattern = rule.pattern.endsWith(':*') ? `${rule.pattern.slice(0, -2)} *` : rule.pattern;
  const flags = tool === 'PowerShell' ? 'i' : '';
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  if (new RegExp(`^${source}$`, flags).test(command)) return true;
  const bare = pattern.slice(0, -2);
  return pattern.endsWith(' *') && !bare.includes('*') && new RegExp(`^${source.slice(0, -3)}$`, flags).test(command);
};

const SHELLS = ['Bash', 'PowerShell'];

// Deny and ask rules also match past leading variable assignments (`FOO=bar cmd` is `cmd`).
const withoutAssignments = (command: string) => command.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '');

const decision = (tool: string, command: string) => {
  const commands = [command, withoutAssignments(command)];
  if (denyRules.some((rule) => commands.some((text) => ruleMatches(rule, tool, text)))) return 'deny';
  if (askRules.some((rule) => commands.some((text) => ruleMatches(rule, tool, text)))) return 'ask';
  return 'default';
};

// Package scripts that reach a remote database, deploy, change secrets, or call Stripe with the
// configured key. A new one must be covered by an ask rule.
const REMOTE_COMMAND =
  /--remote\b|--preview\b|--allow-production\b|--label (?:production|staging)\b|wrangler (?:deploy|secret|versions|rollback|delete)\b|opennextjs-cloudflare (?:deploy|upload)\b|scripts\/stripe\/configure-portal/;
const remoteScripts = Object.entries(packageScripts)
  .filter(([name, command]) => REMOTE_COMMAND.test(command) || /:(?:staging|prod|remote)\b/.test(name))
  .map(([name]) => name);

describe('.claude/settings.json', () => {
  it('asks before every package script that reaches staging, production, Cloudflare, or Stripe', () => {
    expect(remoteScripts).toEqual(expect.arrayContaining(['db:migrate:d1:prod', 'db:migrate:d1:staging', 'stripe:portal:configure']));
    const unasked = remoteScripts.flatMap((name) =>
      SHELLS.flatMap((shell) =>
        [`pnpm run ${name}`, `pnpm ${name}`]
          .filter((command) => decision(shell, command) !== 'ask')
          .map((command) => `${shell}: ${command}`),
      ),
    );
    expect(unasked).toEqual([]);
  });

  it.each([
    'npx wrangler d1 migrations apply serp-checklists-db --remote',
    'pnpm exec wrangler d1 execute DB --remote --preview --command "SELECT 1"',
    'wrangler r2 object put serp-checklists/example.txt --file=example.txt --remote',
    'node scripts/d1-baseline-migrations.mjs --remote --database serp-checklists-db --allow-production',
    'npx wrangler deploy --env production',
    'npx wrangler versions deploy',
    'npx wrangler versions upload',
    'npx wrangler rollback',
    'npx wrangler delete',
    'npx wrangler secret put STRIPE_SECRET_KEY --env production',
    'pnpm exec opennextjs-cloudflare deploy',
    'pnpm exec opennextjs-cloudflare upload',
    'stripe products list --live',
    'wrangler deploy --env production',
    'pnpm wrangler versions deploy',
    'CLOUDFLARE_ACCOUNT_ID=abc123 npx wrangler d1 migrations apply serp-checklists-db --remote',
    'npx opennextjs-cloudflare deploy',
  ])('asks before %s', (command) => {
    for (const shell of SHELLS) expect(decision(shell, command), shell).toBe('ask');
  });

  // In CI an ask rule denies, so a rule that matched text inside another command would stop
  // the review from posting a comment that mentions a deploy, or from searching for one.
  it.each([
    'gh pr comment 7 --body "Run npx wrangler deploy --remote after this merges"',
    'gh pr comment 7 --body "This adds a wrangler secret put step"',
    'grep -rn "wrangler deploy" scripts docs',
    'git commit -m "docs: explain npx wrangler d1 migrations apply --remote"',
  ])('lets %s through, which only mentions such a command', (command) => {
    for (const shell of SHELLS) expect(decision(shell, command), shell).toBe('default');
  });

  it('starts no rule with a wildcard, which would match inside other commands', () => {
    const loose = [...denyRules, ...askRules].filter((rule) => rule.pattern?.startsWith('*'));
    expect(loose).toEqual([]);
  });

  it('gives every Bash rule a PowerShell twin', () => {
    for (const rules of [denyRules, askRules]) {
      const patterns = (tool: string) => rules.filter((rule) => rule.tool === tool).map((rule) => rule.pattern);
      expect(patterns('PowerShell')).toEqual(patterns('Bash'));
    }
  });

  it.each([
    'pnpm run dev:all',
    'pnpm run db:migrate:d1:local',
    'pnpm run db:query "SELECT * FROM templates LIMIT 5"',
    'npx wrangler d1 execute serp-checklists-db --local --command "SELECT 1"',
    'pnpm run preview',
    'pnpm run build:worker',
    'pnpm run test:e2e:full tests/e2e/templates.spec.ts',
    'pnpm run stripe:local:listen',
    'pnpm run verify',
    'grep -rn "remote" package.json',
  ])('runs %s without asking', (command) => {
    for (const shell of SHELLS) expect(decision(shell, command), shell).toBe('default');
  });

  it('denies rg, which crashes VS Code (AGENTS.md)', () => {
    for (const shell of SHELLS) {
      expect(decision(shell, 'rg "useAuth" src'), shell).toBe('deny');
      expect(decision(shell, 'rg'), shell).toBe('deny');
    }
  });
});

const stepSchema = z.object({ uses: z.string().optional(), with: z.record(z.unknown()).optional() });
const workflowSchema = z.object({ jobs: z.record(z.object({ steps: z.array(stepSchema).optional() })) });

// The tools a workflow's Claude Code steps allow (--allowedTools in claude_args).
const allowedToolsIn = (file: string) =>
  Object.values(workflowSchema.parse(yaml.load(readText(file))).jobs)
    .flatMap((job) => job.steps ?? [])
    .filter((step) => step.uses?.startsWith('anthropics/claude-code-action'))
    .flatMap((step) => {
      const list = /--allowedTools\s+"([^"]*)"/.exec(String(step.with?.claude_args ?? ''))?.[1] ?? '';
      return list.split(',').map((tool) => tool.trim()).filter(Boolean);
    });

describe('the CI Claude jobs under .claude/settings.json', () => {
  const reviewTools = allowedToolsIn('.github/workflows/claude-code-review.yml');
  const maintenanceTools = allowedToolsIn('.github/workflows/maintenance.yml');
  // Read-only tools need no allow rule, so the review uses them without listing them.
  const tools = [...new Set([...reviewTools, ...maintenanceTools, 'Read', 'Glob', 'Grep'])];

  it('finds both allow lists', () => {
    expect(reviewTools).toContain('Task');
    expect(maintenanceTools).toContain('Bash(git:*)');
  });

  it('neither denies nor asks for a tool they use', () => {
    const blocked = tools.filter((tool) => {
      const rule = parseRule(tool);
      if (rule.pattern === null) return [...denyRules, ...askRules].some((other) => other.tool === rule.tool);
      return decision(rule.tool, rule.pattern.replace(/(?::| )\*$/, '')) !== 'default';
    });
    expect(blocked).toEqual([]);
  });

  // The weekly doc-gardening job commits, pushes its branch, and opens a pull request.
  it.each([
    'git push -u origin docs/weekly-doc-gardening',
    'gh pr create --base staging --title "docs: weekly doc gardening"',
    'pnpm run docs:check',
  ])('lets the maintenance job run %s', (command) => {
    expect(decision('Bash', command)).toBe('default');
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

  it('gives Chrome a temporary profile, and verify-web the same server for machines without a display', () => {
    const chrome = mcpServers['chrome-devtools'];
    expect(chrome.args).toContain('--isolated');
    const skill = readText('.claude/skills/verify-web/SKILL.md');
    const override = /claude mcp add chrome-devtools --scope local -- ([^`\n]+)/.exec(skill)?.[1].trim().split(/\s+/);
    expect(override?.[0]).toBe(chrome.command);
    expect(override?.slice(1).sort()).toEqual([...chrome.args, '--headless'].sort());
  });
});
