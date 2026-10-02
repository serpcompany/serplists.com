import { describe, expect, it } from 'vitest';

import {
  accessibleName,
  findControls,
  findLabelsNotBoundToOneElement,
  findUnnamedControls,
  getByAccessibleName,
} from './accessibleMarkup';

describe('accessibleMarkup', () => {
  it('never names a field by its placeholder, which disappears once the field has a value', () => {
    const html = '<input id="slug" placeholder="my-template-slug"/>';

    expect(findUnnamedControls(html)).toEqual(['<input id="slug" placeholder="my-template-slug">']);
    expect(getByAccessibleName(html, 'my-template-slug')).toBeUndefined();
  });

  it('names a control by aria-labelledby, then aria-label, then a label for its id, and a button by its text too', () => {
    const html = [
      '<p id="title">Launch plan</p>',
      '<input id="by-labelledby" aria-labelledby="title" aria-label="Ignored"/>',
      '<input id="by-aria-label" aria-label="Search"/>',
      '<label for="by-label">Template Name</label><input id="by-label"/>',
      '<button type="button">Save</button>',
    ].join('');

    expect(findControls(html).map((control) => accessibleName(html, control))).toEqual([
      'Launch plan',
      'Search',
      'Template Name',
      'Save',
    ]);
  });

  it('finds an element that claims a widget role, such as the span Base UI renders for a checkbox', () => {
    const html =
      '<span role="checkbox" aria-checked="false"></span><span role="checkbox" aria-label="Send the email"></span>';

    expect(findUnnamedControls(html)).toEqual(['<span role="checkbox">']);
    expect(getByAccessibleName(html, 'Send the email')?.tag).toBe('span');
  });

  it('skips controls hidden from everyone', () => {
    const html = '<input type="hidden" name="token"/><button aria-hidden="true" tabindex="-1"></button>';

    expect(findControls(html)).toEqual([]);
  });

  it('reports a label with no for, or a for that matches no id or more than one', () => {
    const html = [
      '<label>Orphan</label>',
      '<label for="missing">Missing</label>',
      '<label for="twice">Twice</label><input id="twice"/><input id="twice"/>',
      '<label for="once">Once</label><input id="once"/>',
    ].join('');

    expect(findLabelsNotBoundToOneElement(html)).toEqual(['Orphan', 'Missing', 'Twice']);
  });
});
