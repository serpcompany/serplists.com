import { describe, expect, it } from 'vitest';

import { applyTemplateOperation } from '@functions/api/handlers/agentMcpTemplateEdits';
import { templateOperationArgs } from '@functions/api/handlers/agentMcpTemplateTools';
import { parseToolArguments } from '@functions/api/handlers/agentMcpTools';
import { withStableTemplateIdentities } from '@functions/api/utils/template-identities';
import {
  assignMissingStableTemplateIdentities,
  validateStableTemplateIdentities,
} from '@functions/api/utils/template-reconciliation';
import { getTaskFormFields } from '@/lib/schemas/storedSections';
import { formOptionRecordsIn, sectionRecordsIn, taskRecordsIn } from '@/lib/schemas/jsonRecords';
import { firstOf } from '../../../support/elements';

type JsonRecord = Record<string, unknown>;

const sections = (...tasks: JsonRecord[]) => [{ id: 's1', title: 'Kickoff', items: tasks }];
const taskWithForm = (id: string, fields: JsonRecord[]) => ({ id, title: `Task ${id}`, contents: [{ id: `${id}-form`, type: 'form', value: '', fields }] });

const fieldsOf = (stored: unknown, taskIndex = 0) => {
  const task = taskRecordsIn(firstOf(sectionRecordsIn(stored)).items)[taskIndex];
  return task ? getTaskFormFields(task) : [];
};
const fieldIds = (stored: unknown, taskIndex = 0) => fieldsOf(stored, taskIndex).map((field) => field.id);
const optionIds = (stored: unknown) => fieldsOf(stored).map((field) => formOptionRecordsIn(field.options).map((option) => option.id));

describe('form field identities, which answers are keyed by', () => {
  it('keeps field ids, gives a field without one a stable legacy id, and gives options without one a positional id', () => {
    const stable = assignMissingStableTemplateIdentities(sections(taskWithForm('t1', [
      { id: 'field_kept', label: 'Name', kind: 'text' },
      { label: 'Plan', kind: 'select', options: [{ label: 'Basic' }, { id: 'pro', label: 'Pro' }] },
    ])));

    expect(fieldIds(stable)).toEqual(['field_kept', 'legacy-field-1-1-2']);
    expect(optionIds(stable)).toEqual([[], ['option-1', 'pro']]);
    expect(validateStableTemplateIdentities(stable)).toBeNull();
  });

  it('gives a field without an id the id the stored field at its place already had', () => {
    const previous = assignMissingStableTemplateIdentities(sections(taskWithForm('t1', [{ label: 'Name', kind: 'text' }])));
    const incoming = sections(taskWithForm('t1', [{ label: 'Full name', kind: 'text' }]));

    expect(fieldIds(assignMissingStableTemplateIdentities(incoming, previous))).toEqual(fieldIds(previous));
  });

  it('requires an id on every field and refuses an id used twice anywhere in the Template', () => {
    expect(validateStableTemplateIdentities(sections(taskWithForm('t1', [{ label: 'Name', kind: 'text' }]))))
      .toBe('Every form field in item t1 requires a stable id');
    expect(validateStableTemplateIdentities(sections(
      taskWithForm('t1', [{ id: 'f', label: 'Name', kind: 'text' }]),
      taskWithForm('t2', [{ id: 'f', label: 'Email', kind: 'email' }]),
    ))).toBe('Duplicate form field id: f');
  });

  it('leaves stored content with every id in place untouched, and fills in missing field and option ids on read', () => {
    const complete = sections(taskWithForm('t1', [{ id: 'f1', label: 'Plan', kind: 'select', options: [{ id: 'o1', label: 'Pro' }] }]));
    expect(withStableTemplateIdentities(complete)).toBe(complete);

    const missing = sections(taskWithForm('t1', [
      { label: 'Plan', kind: 'select', options: [{ label: 'Pro' }], answer: 'option-1' },
    ]));
    const stable = withStableTemplateIdentities(missing);
    expect(fieldIds(stable)).toEqual(['legacy-field-1-1-1']);
    expect(optionIds(stable)).toEqual([['option-1']]);
    expect(firstOf(fieldsOf(stable)).answer).toBe('option-1');
    expect(withStableTemplateIdentities(stable)).toBe(stable);
  });
});

const FIELD_ID = /^field_[0-9a-f-]{36}$/;
const OPTION_ID = /^option_[0-9a-f-]{36}$/;

describe('MCP template operations on form blocks', () => {
  it('insert_task gives new fields and options ids, keeps given ones and drops answers', () => {
    const result = applyTemplateOperation(sections({ id: 't1', title: 'First' }), parseToolArguments(templateOperationArgs, {
      templateId: 'tpl-1',
      expectedVersion: 2,
      operation: 'insert_task',
      sectionId: 's1',
      task: {
        title: 'Collect the brief',
        contents: [{ type: 'form', fields: [
          { id: 'field_given', label: 'Name', kind: 'text', required: true, answer: 'Acme' },
          { label: 'Plan', kind: 'select', options: [{ label: 'Basic' }, { id: 'pro', label: 'Pro' }] },
        ] }],
      },
    }));

    const [given, added] = fieldsOf(result.sections, 1);
    expect(given).toEqual({ id: 'field_given', label: 'Name', kind: 'text', required: true });
    expect(added?.id).toMatch(FIELD_ID);
    const [basic, pro] = formOptionRecordsIn(added?.options);
    expect(basic?.id).toMatch(OPTION_ID);
    expect(pro?.id).toBe('pro');
  });
});
