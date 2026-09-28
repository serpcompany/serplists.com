import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AUDIT_ACTIONS } from '@/lib/schemas/auditActions';

// Every audit action the API writes must be registered, so the Organization
// Activity list (and any other history view) has a label for it.

const repoRoot = join(__dirname, '../../../..');

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function collectWrittenAuditActions(): Map<string, string> {
  const actions = new Map<string, string>();
  const literal = /\baction:\s*(["'])([a-z_]+\.[a-z_]+)\1/g;

  for (const file of listTypeScriptFiles(join(repoRoot, 'functions'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(literal)) {
      actions.set(match[2], relative(repoRoot, file));
    }
  }

  return actions;
}

describe('AUDIT_ACTIONS', () => {
  it('lists every audit action literal written under functions/', () => {
    const written = collectWrittenAuditActions();
    const registered = new Set<string>(AUDIT_ACTIONS);

    expect(written.size).toBeGreaterThan(10);
    const missing = [...written].filter(([action]) => !registered.has(action));
    expect(missing, 'Add these actions to src/lib/schemas/auditActions.ts').toEqual([]);
  });

  it('has no duplicates and keeps the stored resource.verb shape', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
    for (const action of AUDIT_ACTIONS) {
      expect(action).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });
});
