import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RetiredRunItems } from '@/components/run-execution/RetiredRunItems';
import type { RetiredRunItem } from '@/types/checklist';

const retired: RetiredRunItem[] = [
  {
    kind: 'item',
    id: 'dns',
    sectionTitle: 'Launch',
    task: { id: 'dns', title: 'Check DNS', isCompleted: true, notes: 'Registrar login is in vault X', subTasks: [] },
  },
  {
    kind: 'section',
    id: 'qa',
    title: 'QA',
    tasks: [{
      id: 'checkout',
      title: 'Test checkout',
      isCompleted: false,
      notes: 'Card declined twice',
      subTasks: [{ id: 'card', title: 'Card payment', isCompleted: true }],
    }],
  },
  { kind: 'subItem', id: 'tagline', itemTitle: 'Write copy', subTask: { id: 'tagline', title: 'Tagline', isCompleted: false } },
];

describe('RetiredRunItems', () => {
  it('shows each removed task with its completion and notes, read-only', () => {
    const markup = renderToStaticMarkup(<RetiredRunItems items={retired} />);

    expect(markup).toContain('Removed from Template');
    expect(markup).toContain('Check DNS');
    expect(markup).toContain('In Launch');
    expect(markup).toContain('Registrar login is in vault X');
    expect(markup).toContain('Completed');
    expect(markup).toContain('Not completed');
    expect(markup).toContain('QA');
    expect(markup).toContain('Test checkout');
    expect(markup).toContain('Card declined twice');
    expect(markup).toContain('Card payment');
    expect(markup).toContain('Tagline');
    expect(markup).toContain('Sub-task of Write copy');
    expect(markup).not.toMatch(/<(input|textarea|button)\b/);
  });

  it('shows the answer of a removed field, and the answers of a removed task, as text', () => {
    const markup = renderToStaticMarkup(<RetiredRunItems items={[
      { kind: 'formAnswer', id: 'plan', itemTitle: 'Collect brief', formAnswer: { fieldId: 'plan', label: 'Plan', kind: 'select', answer: 'Pro' } },
      {
        kind: 'item',
        id: 'intake',
        task: {
          id: 'intake',
          title: 'Intake',
          isCompleted: true,
          subTasks: [],
          answers: [{ fieldId: 'name', label: 'Client name', kind: 'text', answer: 'Acme' }],
        },
      },
    ]} />);

    expect(markup).toContain('Plan:</span> Pro');
    expect(markup).toContain('Answer in Collect brief');
    expect(markup).toContain('Client name:</span> Acme');
    expect(markup).not.toMatch(/<(input|textarea|button|select)\b/);
  });

  it('renders nothing when no work was removed', () => {
    expect(renderToStaticMarkup(<RetiredRunItems items={[]} />)).toBe('');
  });
});
