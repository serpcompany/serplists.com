import { describe, expect, it, vi } from 'vitest';

import {
  createTaskRevealer,
  isTaskHeaderInView,
  isTypingTarget,
  type TaskRevealView,
} from '@/features/run-execution/taskReveal';

// The console shell scrolls the window, and Mark Complete, Previous and Next sit below the
// task's content. Moving to another task swaps the content in place, so without a reveal the
// new task opens scrolled past its title.

// A 720px window under a 56px sticky header.
const STICKY = 56;
const VIEWPORT = 720;

const view = (
  { headerTop, titleBottom = headerTop + 120, activeElement = { tagName: 'BUTTON' } }: {
    activeElement?: TaskRevealView['activeElement'];
    headerTop: number;
    titleBottom?: number;
  },
) => {
  const scrollIntoView = vi.fn();
  const focus = vi.fn();
  const onScrolled = vi.fn();
  const getView = vi.fn(
    (): TaskRevealView => ({
      activeElement,
      header: { getBoundingClientRect: () => ({ top: headerTop }), scrollIntoView },
      onScrolled,
      stickyOffset: STICKY,
      title: { focus, getBoundingClientRect: () => ({ bottom: titleBottom }) },
      viewportHeight: VIEWPORT,
    }),
  );
  return { focus, getView, onScrolled, scrollIntoView };
};

describe('createTaskRevealer', () => {
  it('scrolls the next task to its title when Mark Complete moved on from the bottom of a long task', () => {
    const reveal = createTaskRevealer();
    reveal('task-a', view({ headerTop: 150 }).getView);

    // Task A was about 2000px tall; the user scrolled to its buttons (header ~1250px up).
    const next = view({ headerTop: -1250 });
    reveal('task-b', next.getView);

    expect(next.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(next.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(next.onScrolled).toHaveBeenCalledTimes(1);
    expect(next.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('scrolls when the header is hidden under the sticky site header', () => {
    const reveal = createTaskRevealer();
    reveal('task-a', view({ headerTop: 150 }).getView);

    const next = view({ headerTop: 20 });
    reveal('task-b', next.getView);

    expect(next.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('scrolls when the title ends below the window', () => {
    const reveal = createTaskRevealer();
    reveal('task-a', view({ headerTop: 150 }).getView);

    const next = view({ headerTop: 640, titleBottom: 760 });
    reveal('task-b', next.getView);

    expect(next.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('does not move the page when the new task title is already in view, but still focuses it', () => {
    const reveal = createTaskRevealer();
    reveal('task-a', view({ headerTop: 150 }).getView);

    const next = view({ headerTop: 150 });
    reveal('task-b', next.getView);

    expect(next.scrollIntoView).not.toHaveBeenCalled();
    expect(next.onScrolled).not.toHaveBeenCalled();
    expect(next.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('does nothing when the run first opens', () => {
    const reveal = createTaskRevealer();
    const first = view({ headerTop: -400 });
    reveal('task-a', first.getView);

    expect(first.getView).not.toHaveBeenCalled();
    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(first.focus).not.toHaveBeenCalled();
  });

  it('does nothing when the same task re-renders (notes, a sub-task, a refetch)', () => {
    const reveal = createTaskRevealer();
    reveal('task-a', view({ headerTop: 150 }).getView);

    const same = view({ headerTop: -900 });
    reveal('task-a', same.getView);
    reveal('task-a', same.getView);

    expect(same.getView).not.toHaveBeenCalled();
    expect(same.scrollIntoView).not.toHaveBeenCalled();
    expect(same.focus).not.toHaveBeenCalled();
  });

  it('reveals again on every later change, including going back', () => {
    const reveal = createTaskRevealer();
    reveal('task-a', view({ headerTop: 150 }).getView);
    reveal('task-b', view({ headerTop: -600 }).getView);

    const back = view({ headerTop: -600 });
    reveal('task-a', back.getView);

    expect(back.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('leaves the page and focus alone while the user is typing in a field', () => {
    const reveal = createTaskRevealer();
    reveal('task-a', view({ headerTop: 150 }).getView);

    const typing = view({ activeElement: { tagName: 'INPUT', type: 'text' }, headerTop: -600 });
    reveal('task-b', typing.getView);

    expect(typing.scrollIntoView).not.toHaveBeenCalled();
    expect(typing.focus).not.toHaveBeenCalled();
  });

  it('copes with a page that has no header to reveal', () => {
    const reveal = createTaskRevealer();
    reveal('task-a', view({ headerTop: 150 }).getView);

    expect(() => reveal('task-b', () => null)).not.toThrow();
  });
});

describe('isTaskHeaderInView', () => {
  it('is in view between the sticky header and the bottom of the window', () => {
    expect(isTaskHeaderInView({ headerTop: STICKY, stickyOffset: STICKY, titleBottom: 200, viewportHeight: VIEWPORT })).toBe(true);
    expect(isTaskHeaderInView({ headerTop: 300, stickyOffset: STICKY, titleBottom: VIEWPORT, viewportHeight: VIEWPORT })).toBe(true);
  });

  it('allows a pixel of subpixel rounding once scrolled into place', () => {
    expect(isTaskHeaderInView({ headerTop: STICKY - 0.5, stickyOffset: STICKY, titleBottom: 200, viewportHeight: VIEWPORT })).toBe(true);
  });

  it('is out of view above the sticky header or with its title below the window', () => {
    expect(isTaskHeaderInView({ headerTop: STICKY - 2, stickyOffset: STICKY, titleBottom: 200, viewportHeight: VIEWPORT })).toBe(false);
    expect(isTaskHeaderInView({ headerTop: -1200, stickyOffset: STICKY, titleBottom: -1100, viewportHeight: VIEWPORT })).toBe(false);
    expect(isTaskHeaderInView({ headerTop: 650, stickyOffset: STICKY, titleBottom: VIEWPORT + 1, viewportHeight: VIEWPORT })).toBe(false);
  });
});

describe('isTypingTarget', () => {
  it('treats text fields, text areas, selects and editable content as typing', () => {
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'input', type: 'search' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ isContentEditable: true, tagName: 'DIV' })).toBe(true);
  });

  it('does not treat buttons, checkboxes, links or the page body as typing', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget({ tagName: 'A' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'submit' })).toBe(false);
  });
});
