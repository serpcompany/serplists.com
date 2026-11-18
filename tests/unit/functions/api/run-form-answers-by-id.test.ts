import { describe, expect, it } from 'vitest';
import { formIncompleteResponse } from '@functions/api/utils/run-form-guard';

const field = (id: string | undefined, answer?: string) => ({
  ...(id === undefined ? {} : { id }),
  label: 'Client',
  kind: 'text',
  required: true,
  ...(answer === undefined ? {} : { answer }),
});
const run = (isCompleted: boolean, ...fields: unknown[]) => [{
  id: 's1',
  title: 'Kickoff',
  items: [{ id: 't1', title: 'Collect the brief', isCompleted, contents: [{ id: 'c1', type: 'form', value: '', fields }] }],
}];

describe('formIncompleteResponse matches submitted answers to stored fields by id', () => {
  it('takes an answer for a stored field by its id, past entries that are not fields', () => {
    expect(formIncompleteResponse(run(false, 'not a field', field('f1')), run(true, field('f1', 'Acme')))).toBeNull();
  });

  it('cannot match an answer sent without a field id, so the required field stays unanswered', async () => {
    const response = formIncompleteResponse(run(false, field('f1')), run(true, field(undefined, 'Acme')));

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({ code: 'form_incomplete' });
  });

  it('cannot answer a stored field that has no id', () => {
    expect(formIncompleteResponse(run(false, field(undefined)), run(true, field(undefined, 'Acme')))?.status).toBe(409);
  });
});
