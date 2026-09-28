import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { calculateRunProgress, resetRunCompletionState } from '@functions/api/utils/template-reconciliation';
import { TICKED_TEMPLATE_SECTIONS, UNTICKED_RUN_SECTIONS } from '../../../fixtures/runStartFixtures';

describe('resetRunCompletionState', () => {
  it('unticks every task and Sub-task and drops run notes and the legacy completed key', () => {
    const sections = resetRunCompletionState(TICKED_TEMPLATE_SECTIONS);

    expect(sections).toEqual(UNTICKED_RUN_SECTIONS);
    expect(calculateRunProgress(sections)).toBe(0);
  });

  it('does not change its input', () => {
    const input = structuredClone(TICKED_TEMPLATE_SECTIONS);

    resetRunCompletionState(input);

    expect(input).toEqual(TICKED_TEMPLATE_SECTIONS);
  });

  it('leaves non-task entries and non-Sub-task content alone', () => {
    const content = { type: 'link', value: 'https://example.com', isCompleted: true };
    const sections = resetRunCompletionState([
      null,
      { id: 's1', title: 'Only content', items: ['not a task', { id: 't1', contents: [content, 'x'] }] },
    ]);

    expect(sections).toEqual([
      null,
      { id: 's1', title: 'Only content', items: ['not a task', { id: 't1', isCompleted: false, contents: [content, 'x'] }] },
    ]);
  });
});

describe('run start state has one implementation', () => {
  // The web and MCP handlers each had their own reset and they drifted apart, so a template
  // started differently depending on where the run was started.
  it('is not reimplemented in any handler', () => {
    const handlers = path.resolve(__dirname, '../../../../functions/api/handlers');
    const copies = readdirSync(handlers)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => /function\s+resetCompletionState|resetCompletionState\s*=/.test(readFileSync(path.join(handlers, file), 'utf8')));

    expect(copies).toEqual([]);
  });
});
