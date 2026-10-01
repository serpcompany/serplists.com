import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { calculateRunProgress, resetRunCompletionState } from '@functions/api/utils/template-reconciliation';
import { TEMPLATE_SECTIONS_CARRYING_RUN_STATE, UNTICKED_RUN_SECTIONS } from '../../../fixtures/runStartFixtures';

describe('resetRunCompletionState', () => {
  it('unticks every task and Sub-task and drops run notes and the legacy completed key', () => {
    const sections = resetRunCompletionState(TEMPLATE_SECTIONS_CARRYING_RUN_STATE);

    expect(sections).toEqual(UNTICKED_RUN_SECTIONS);
    expect(calculateRunProgress(sections)).toBe(0);
  });

  it('does not change its input', () => {
    const input = structuredClone(TEMPLATE_SECTIONS_CARRYING_RUN_STATE);

    resetRunCompletionState(input);

    expect(input).toEqual(TEMPLATE_SECTIONS_CARRYING_RUN_STATE);
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
  it('is not reimplemented in any handler, since the web and MCP copies drifted apart and started runs differently', () => {
    const handlers = path.resolve(__dirname, '../../../../functions/api/handlers');
    const copies = readdirSync(handlers)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => /function\s+resetCompletionState|resetCompletionState\s*=/.test(readFileSync(path.join(handlers, file), 'utf8')));

    expect(copies).toEqual([]);
  });
});
