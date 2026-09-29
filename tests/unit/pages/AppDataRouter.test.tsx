import { readFileSync } from 'node:fs';
import { createMemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('App data router', () => {
  // useBlocker, which keeps unsaved template edits from being lost on sidebar links,
  // header links, and browser Back, only works under a data router.
  it('renders the routes through a data router, not BrowserRouter', () => {
    const appSource = readSource('src/App.tsx');

    expect(appSource).toContain('createBrowserRouter');
    expect(appSource).toContain('<RouterProvider');
    expect(appSource).not.toContain('BrowserRouter as');
    expect(appSource).not.toContain('<Routes>');
  });

  it('blocks every way out of a dirty template editor', () => {
    expect(readSource('src/pages/TemplateEditor.tsx')).toContain(
      'useTemplateEditorLeaveGuard(',
    );
    expect(
      readSource('src/features/template-editor/useTemplateEditorLeaveGuard.ts'),
    ).toContain('useUnsavedChangesGuard(');
    expect(readSource('src/lib/navigation/useUnsavedChangesGuard.ts')).toContain('useBlocker(');
  });

  // Task notes are kept only on the page until Save notes: a sidebar link, browser Back,
  // or Sign out must ask first, as the page's own Runs button does.
  it('blocks every way out of a run page with unsaved task notes, asking once', () => {
    const runPage = readSource('src/pages/ChecklistRun.tsx');

    expect(runPage).toContain('useUnsavedChangesGuard(hasUnsavedNotes, RUN_NOTES_UNSAVED_MESSAGE');
    expect(runPage).not.toContain('confirmLeaveWithUnsavedNotes');
  });

  it('keeps the editor open on a blocked link or Back, and leaves once the user confirms', async () => {
    const router = createMemoryRouter(
      [
        { path: '/dashboard/templates', element: null },
        { path: '/dashboard/templates/:id/edit', element: null },
        { path: '/dashboard/runs', element: null },
      ],
      { initialEntries: ['/dashboard/templates', '/dashboard/templates/t1/edit'], initialIndex: 1 },
    );
    const blocker = 'editor';
    // As useUnsavedChangesGuard blocks: only a pathname change.
    router.getBlocker(
      blocker,
      ({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname,
    );

    await router.navigate('/dashboard/runs');
    expect(router.state.location.pathname).toBe('/dashboard/templates/t1/edit');
    expect(router.state.blockers.get(blocker)?.state).toBe('blocked');
    router.state.blockers.get(blocker)?.reset?.();

    await router.navigate(-1);
    expect(router.state.location.pathname).toBe('/dashboard/templates/t1/edit');
    expect(router.state.blockers.get(blocker)?.state).toBe('blocked');

    router.state.blockers.get(blocker)?.proceed?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.state.location.pathname).toBe('/dashboard/templates');

    router.deleteBlocker(blocker);
    router.dispose();
  });
});
