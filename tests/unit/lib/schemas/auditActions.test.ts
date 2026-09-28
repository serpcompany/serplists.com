import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUDIT_ACTIONS, TEMPLATE_VERSION_ACTIONS } from '@/lib/schemas/auditActions';

// Every audit action the API writes must be registered, so the Organization
// Activity list (and every other history view) has a label for it.

const repoRoot = join(__dirname, '../../../..');

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const functionSources = listTypeScriptFiles(join(repoRoot, 'functions')).map((file) => ({
  file: relative(repoRoot, file),
  source: readFileSync(file, 'utf8'),
}));

// Each `<key>: "resource.verb"` literal under functions/, with the file that writes it.
function collectLiterals(key: string): Map<string, string> {
  const literal = new RegExp(String.raw`\b${key}:\s*(["'])([a-z_]+\.[a-z_]+)\1`, 'g');
  const found = new Map<string, string>();

  for (const { file, source } of functionSources) {
    for (const match of source.matchAll(literal)) {
      found.set(match[2], file);
    }
  }

  return found;
}

// AuditEventInput.action is typed by AUDIT_ACTIONS, so the history label maps cover every
// action. This also catches an action that reaches the audit log around the type (a cast).
describe('AUDIT_ACTIONS', () => {
  it('lists every audit action literal written under functions/', () => {
    const written = collectLiterals('action');
    const registered = new Set<string>(AUDIT_ACTIONS);

    expect(written.size).toBeGreaterThan(10);
    const missing = [...written].filter(([action]) => !registered.has(action));
    expect(missing, 'Add these actions to src/lib/schemas/auditActions.ts').toEqual([]);
  });

  it('lists only actions some handler writes', () => {
    const written = collectLiterals('action');

    expect(AUDIT_ACTIONS.filter((action) => !written.has(action))).toEqual([]);
  });

  it('lists every template version change summary', () => {
    const summaries = [...collectLiterals('changeSummary').keys()];

    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries.filter((action) => !(TEMPLATE_VERSION_ACTIONS as readonly string[]).includes(action))).toEqual([]);
  });

  it('has no duplicates and keeps the stored resource.verb shape', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
    for (const action of AUDIT_ACTIONS) {
      expect(action).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });
});
