import React, { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TaskHeaderReveal } from '@/components/run-execution/TaskHeaderReveal';

import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();

const whatTheTaskEffectsSeeFocused = async (Reveal: typeof TaskHeaderReveal) => {
  const focused: string[] = [];
  function FocusProbe() {
    useEffect(() => {
      focused.push(document.activeElement?.tagName ?? 'nothing');
    });
    return null;
  }
  const page = (taskId: string) => (
    <Reveal taskId={taskId}>
      <h2 tabIndex={-1}>{taskId}</h2>
      <FocusProbe />
    </Reveal>
  );
  const shown = await renderSettled(page('task-1'));
  shown.rerender(page('task-2'));
  shown.unmount();
  return focused;
};

describe('TaskHeaderReveal loaded with a window, as in a browser, or with none, as on the server', () => {
  it("focuses the next task's title before the effects of what it holds run, in a browser", async () => {
    expect(await whatTheTaskEffectsSeeFocused(TaskHeaderReveal)).toEqual(['BODY', 'H2']);
  });

  it('focuses it in an effect of its own when loaded with no window, which runs after the effects of what it holds', async () => {
    vi.resetModules();
    vi.stubGlobal('window', undefined);
    const loaded = await import('@/components/run-execution/TaskHeaderReveal');
    vi.unstubAllGlobals();

    expect(await whatTheTaskEffectsSeeFocused(loaded.TaskHeaderReveal)).toEqual(['BODY', 'BODY']);
  });
});
