import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUDIT_ACTIONS, TEMPLATE_VERSION_ACTIONS } from '@/lib/schemas/auditActions';

const handlersDir = path.resolve(__dirname, '../../../../functions/api/handlers');
const handlerSources = readdirSync(handlersDir)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => readFileSync(path.join(handlersDir, file), 'utf8'));
const literals = (key: string) =>
  handlerSources.flatMap((source) =>
    [...source.matchAll(new RegExp(String.raw`\b${key}:\s*['"]([a-z_]+\.[a-z_]+)['"]`, 'g'))].map((match) => match[1]),
  );

// AuditEventInput.action is typed by AUDIT_ACTIONS, so the history label maps cover every
// action. This also catches an action that reaches the audit log around the type (a cast).
describe('AUDIT_ACTIONS', () => {
  it('lists every action the API handlers write', () => {
    const written = literals('action');

    expect(written.length).toBeGreaterThan(0);
    expect(written.filter((action) => !(AUDIT_ACTIONS as readonly string[]).includes(action))).toEqual([]);
  });

  it('lists only actions some handler writes', () => {
    const written = new Set(literals('action'));

    expect(AUDIT_ACTIONS.filter((action) => !written.has(action))).toEqual([]);
  });

  it('lists every template version change summary', () => {
    const summaries = literals('changeSummary');

    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries.filter((action) => !(TEMPLATE_VERSION_ACTIONS as readonly string[]).includes(action))).toEqual([]);
  });
});
