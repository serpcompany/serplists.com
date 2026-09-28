// The run page shows one task at a time in a panel that stays mounted: Mark Complete (its
// auto-advance), Previous, Next and the task lists only change which task is inside it. The
// window is what scrolls, and those buttons sit below the task's content, so without help
// the next task opens where the last one was scrolled to, past its title. The revealer
// scrolls a new task's header into view and moves focus to its title.

// The focused element, as much of it as deciding "is the user typing here" needs.
export interface FocusedElement {
  isContentEditable?: boolean;
  tagName: string;
  type?: string;
}

// What the revealer reads from the page, only when the task actually changed.
export interface TaskRevealView {
  activeElement: FocusedElement | null;
  header: {
    getBoundingClientRect: () => { top: number };
    scrollIntoView: (options: ScrollIntoViewOptions) => void;
  };
  // Called after the page scrolled under the pointer (see ignoreRepeatClicksBriefly).
  onScrolled: () => void;
  // Height of the sticky headers over the page: the header's scroll-margin-top.
  stickyOffset: number;
  title: {
    focus: (options: FocusOptions) => void;
    getBoundingClientRect: () => { bottom: number };
  };
  viewportHeight: number;
}

// Input types that are clicked, not typed in.
const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);

// A field the user is typing in keeps its focus, and the page is not moved away from it.
export const isTypingTarget = (element: FocusedElement | null): boolean => {
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tagName = element.tagName.toUpperCase();
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  return tagName === 'INPUT' && !NON_TEXT_INPUT_TYPES.has((element.type || 'text').toLowerCase());
};

// The header is in view when it starts below the sticky headers and the task title ends
// above the bottom of the window. A pixel of slack absorbs subpixel layout: a header just
// scrolled into place sits exactly at the offset.
export const isTaskHeaderInView = ({
  headerTop,
  stickyOffset,
  titleBottom,
  viewportHeight,
}: {
  headerTop: number;
  stickyOffset: number;
  titleBottom: number;
  viewportHeight: number;
}): boolean => headerTop >= stickyOffset - 1 && titleBottom <= viewportHeight;

// Call on every render with the task shown. The first task shown (the run opening, where the
// browser's own scroll position applies and focus is never taken) and a re-render of the
// same task (notes, a sub-task, a save or refetch) do nothing. Moving to another task
// scrolls its header to just below the sticky headers when it is out of view, then focuses
// its title so keyboard and screen reader users land on it.
export const createTaskRevealer = () => {
  let shownTaskId: string | null = null;

  return (taskId: string, getView: () => TaskRevealView | null): void => {
    const previousTaskId = shownTaskId;
    shownTaskId = taskId;
    if (previousTaskId === null || previousTaskId === taskId) return;

    const view = getView();
    if (!view || isTypingTarget(view.activeElement)) return;

    const inView = isTaskHeaderInView({
      headerTop: view.header.getBoundingClientRect().top,
      stickyOffset: view.stickyOffset,
      titleBottom: view.title.getBoundingClientRect().bottom,
      viewportHeight: view.viewportHeight,
    });
    if (!inView) {
      view.header.scrollIntoView({ block: 'start' });
      view.onScrolled();
    }
    view.title.focus({ preventScroll: true });
  };
};
