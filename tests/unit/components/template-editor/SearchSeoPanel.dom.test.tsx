import { clickTheButton, renderTheTemplateEditorPanels } from '../../../support/templateEditorPanels';
import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { inputNamed, typeInto } from '../../../support/renderInTheDom';

afterEach(cleanup);

const leave = (field: HTMLElement) =>
  act(async () => {
    fireEvent.blur(field);
  });

describe('the Search & SEO panel', () => {
  it('writes the search title and description and previews them', async () => {
    const editor = await renderTheTemplateEditorPanels({ title: 'Move house', description: 'Moving day' });
    await clickTheButton('Search & SEO');

    expect(screen.getByText('Moving day')).toBeTruthy();

    await typeInto(inputNamed('Search Title'), 'The moving checklist');
    await typeInto(screen.getByLabelText('Search Description'), 'Pack, load and unpack');

    expect(editor.values()).toEqual(
      expect.objectContaining({ seoTitle: 'The moving checklist', seoDescription: 'Pack, load and unpack' }),
    );
    expect(screen.getByText('The moving checklist', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('Pack, load and unpack', { selector: 'p' })).toBeTruthy();
  });

  it('turns a typed slug into a URL slug when the field is left', async () => {
    const editor = await renderTheTemplateEditorPanels({ title: 'Move house' });
    await clickTheButton('Search & SEO');

    await typeInto(inputNamed('URL Slug'), 'Moving Day!');
    await leave(inputNamed('URL Slug'));

    expect(editor.values().seoUrl).toBe('moving-day');
    expect(inputNamed('URL Slug').value).toBe('moving-day');
    expect(screen.getByText('http://localhost/profile/jane/moving-day/')).toBeTruthy();
  });

  it('keeps the stored slug as it is when the field is left unchanged', async () => {
    const editor = await renderTheTemplateEditorPanels({ title: 'Move house', seoUrl: 'Old_Slug' });
    await clickTheButton('Search & SEO');

    await leave(inputNamed('URL Slug'));

    expect(editor.values().seoUrl).toBe('Old_Slug');
    expect(editor.form().getFieldState('seoUrl').isDirty).toBe(false);
  });

  it("says an Organization's Template needs the Organization's slug before it has a public URL", async () => {
    await renderTheTemplateEditorPanels({ title: 'Move house' }, { ownerIsOrganization: true, ownerSlug: null });
    await clickTheButton('Search & SEO');

    expect(
      screen.getByText(
        'No public URL yet: the Organization needs a slug, which its owners and admins can set in its settings.',
      ),
    ).toBeTruthy();
  });
});
