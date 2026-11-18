import { navigation } from '../../support/mockedNextNavigation';
import React, { act, useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TemplateEditorRoute from '@/views/TemplateEditorRoute';
import { lastOf } from '../../support/elements';
import { theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

const editorsShown = vi.hoisted(() => ({ list: [] as { editorNumber: number }[], editorsMounted: 0 }));

vi.mock('@/views/TemplateEditor', () => ({
  default: function EditorThatRemembersWhichMountItIs() {
    const [editorNumber] = useState(() => {
      editorsShown.editorsMounted += 1;
      return editorsShown.editorsMounted;
    });
    editorsShown.list.push({ editorNumber });
    return null;
  },
}));

theInMemoryBrowserAsTheWindow();
afterEach(() => {
  cleanup();
  editorsShown.list = [];
  editorsShown.editorsMounted = 0;
});

const editorRoutes = { routes: ['/dashboard/templates/new', '/dashboard/templates/[id]/edit'] };
const shownEditor = () => lastOf(editorsShown.list).editorNumber;
const goTo = (path: string) =>
  act(async () => {
    navigation.router.push(path);
  });

describe('template editor route', () => {
  it('opens a fresh editor for each Template and for the new-template form', async () => {
    navigation.reset('/dashboard/templates/template-a/edit/', editorRoutes);
    render(<TemplateEditorRoute />);
    expect(shownEditor()).toBe(1);

    await goTo('/dashboard/templates/template-b/edit/');
    expect(shownEditor()).toBe(2);

    await goTo('/dashboard/templates/new/');
    expect(shownEditor()).toBe(3);
  });

  it('keeps the same editor while the address stays on the same Template', async () => {
    navigation.reset('/dashboard/templates/template-a/edit/', editorRoutes);
    render(<TemplateEditorRoute />);

    await goTo('/dashboard/templates/template-a/edit/?tab=preview');

    expect(shownEditor()).toBe(1);
    expect(editorsShown.list.length).toBeGreaterThan(1);
  });
});
