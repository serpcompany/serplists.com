export interface FocusedElement {
  isContentEditable?: boolean;
  tagName: string;
  type?: string;
}

export interface TaskRevealView {
  activeElement: FocusedElement | null;
  header: {
    getBoundingClientRect: () => { top: number };
    scrollIntoView: (options: ScrollIntoViewOptions) => void;
  };
  onScrolled: () => void;
  stickyOffset: number;
  title: {
    focus: (options: FocusOptions) => void;
    getBoundingClientRect: () => { bottom: number };
  };
  viewportHeight: number;
}

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);

const SUBPIXEL_SLACK_PX = 1;

export const isTypingTarget = (element: FocusedElement | null): boolean => {
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tagName = element.tagName.toUpperCase();
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  return tagName === 'INPUT' && !NON_TEXT_INPUT_TYPES.has((element.type || 'text').toLowerCase());
};

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
}): boolean => headerTop >= stickyOffset - SUBPIXEL_SLACK_PX && titleBottom <= viewportHeight;

export const createTaskRevealer = () => {
  let shownTaskId: string | null = null;

  return (taskId: string, getView: () => TaskRevealView | null): void => {
    const previousTaskId = shownTaskId;
    shownTaskId = taskId;
    const runJustOpened = previousTaskId === null;
    if (runJustOpened || previousTaskId === taskId) return;

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
