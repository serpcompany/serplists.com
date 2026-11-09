import { describe, expect, it } from 'vitest';
import { validateStableTemplateIdentities } from '@functions/api/utils/template-identities';

const subTasks = (...subItems: unknown[]) => ({ id: 'c1', type: 'subItems', value: '', subItems });
const form = (...fields: unknown[]) => ({ id: 'c2', type: 'form', value: '', fields });
const field = (id?: string) => ({ ...(id === undefined ? {} : { id }), label: 'Client', kind: 'text' });
const task = (id: string | undefined, contents: unknown[] = []) => ({ ...(id === undefined ? {} : { id }), title: 'Ship', contents });
const section = (id: string | undefined, ...items: unknown[]) => ({ ...(id === undefined ? {} : { id }), title: 'Launch', items });

describe('validateStableTemplateIdentities', () => {
  it.each([
    ['a section with no id', [section(undefined)], 'Every template section requires a stable id'],
    ['a section that is not an object', ['Launch'], 'Every template section requires a stable id'],
    ['two sections with one id', [section('s1'), section('s1')], 'Duplicate section id: s1'],
    ['a task with no id', [section('s1', task(undefined))], 'Every item in section s1 requires a stable id'],
    ['a task that is not an object', [section('s1', 'Ship')], 'Every item in section s1 requires a stable id'],
    ['two tasks with one id', [section('s1', task('t1')), section('s2', task('t1'))], 'Duplicate item id: t1'],
    ['a Sub-task with no id', [section('s1', task('t1', [subTasks({ title: 'Draft' })]))], 'Every sub-item in item t1 requires a stable id'],
    [
      'two Sub-tasks with one id',
      [section('s1', task('t1', [subTasks({ id: 'st1', title: 'Draft' })]), task('t2', [subTasks({ id: 'st1', title: 'Review' })]))],
      'Duplicate sub-item id: st1',
    ],
    ['a form field with no id', [section('s1', task('t1', [form(field())]))], 'Every form field in item t1 requires a stable id'],
    ['two form fields with one id', [section('s1', task('t1', [form(field('f1'), field('f1'))]))], 'Duplicate form field id: f1'],
  ])('refuses %s', (_label, sections, message) => {
    expect(validateStableTemplateIdentities(sections)).toBe(message);
  });

  it('accepts ids that are unique within each kind', () => {
    expect(validateStableTemplateIdentities([section('s1', task('t1', [subTasks({ id: 'x', title: 'Draft' }), form(field('f1'))]))])).toBeNull();
  });
});
