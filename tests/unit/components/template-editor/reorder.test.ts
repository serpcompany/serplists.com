import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getKeyboardMoveIndex,
  handleKeyboardReorder,
  moveArrayEntry,
  moveWithButton,
  remapIndexAfterMove,
} from '@/components/template-editor/reorder';

const key = (name: string, modifiers: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {}) => ({
  key: name,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...modifiers,
  preventDefault: vi.fn(),
});

describe('keyboard reordering', () => {
  it('moves one place with Up and Down, with or without Alt, and never wraps', () => {
    expect(getKeyboardMoveIndex(key('ArrowUp'), 2, 3)).toBe(1);
    expect(getKeyboardMoveIndex(key('ArrowDown'), 1, 3)).toBe(2);
    expect(getKeyboardMoveIndex(key('ArrowUp', { altKey: true }), 1, 3)).toBe(0);
    expect(getKeyboardMoveIndex(key('ArrowUp'), 0, 3)).toBe(0);
    expect(getKeyboardMoveIndex(key('ArrowDown'), 2, 3)).toBe(2);
  });

  it('ignores other keys and modified arrows', () => {
    expect(getKeyboardMoveIndex(key('Enter'), 1, 3)).toBeNull();
    expect(getKeyboardMoveIndex(key('ArrowLeft'), 1, 3)).toBeNull();
    expect(getKeyboardMoveIndex(key('ArrowUp', { shiftKey: true }), 1, 3)).toBeNull();
    expect(getKeyboardMoveIndex(key('ArrowUp', { ctrlKey: true }), 1, 3)).toBeNull();
    expect(getKeyboardMoveIndex(key('ArrowUp', { metaKey: true }), 1, 3)).toBeNull();
  });

  it('moves, consumes the key and says where the entry went', () => {
    const move = vi.fn();
    const event = key('ArrowDown');

    const announcement = handleKeyboardReorder(event, { count: 3, handleId: 'x', index: 0, label: 'Prep' }, move);

    expect(move).toHaveBeenCalledWith(0, 1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(announcement).toBe('Moved Prep to position 2 of 3');
  });

  it('consumes the key at either end without moving', () => {
    const move = vi.fn();
    const event = key('ArrowUp');

    expect(handleKeyboardReorder(event, { count: 3, handleId: 'x', index: 0, label: 'Prep' }, move)).toBeNull();
    expect(move).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('keeps an index on the entry it pointed at after a move', () => {
    expect(moveArrayEntry(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(remapIndexAfterMove(2, 2, 0)).toBe(0);
    expect(remapIndexAfterMove(0, 2, 0)).toBe(1);
    expect(remapIndexAfterMove(1, 0, 2)).toBe(0);
  });
});

describe('focus after a move, which can re-insert the moved row and drop its focus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const control = (attribute: 'reorderHandle' | 'reorderMove', value: string, disabled = false) => ({
    dataset: { [attribute]: value },
    disabled,
    focus: vi.fn(),
  });

  const stubPage = (controls: ReturnType<typeof control>[]) => {
    const frames: Array<() => void> = [];
    vi.stubGlobal('window', { requestAnimationFrame: (callback: () => void) => frames.push(callback) });
    vi.stubGlobal('document', { querySelectorAll: () => controls });
    return { renderFrame: () => frames.splice(0).forEach((callback) => callback()) };
  };

  it('puts focus back on the moved handle once the move has rendered', () => {
    const moved = control('reorderHandle', 'task:a');
    const other = control('reorderHandle', 'task:b');
    const page = stubPage([other, moved]);

    handleKeyboardReorder(key('ArrowDown'), { count: 3, handleId: 'task:a', index: 0, label: 'A' }, vi.fn());
    expect(moved.focus).not.toHaveBeenCalled();
    page.renderFrame();

    expect(moved.focus).toHaveBeenCalledTimes(1);
    expect(other.focus).not.toHaveBeenCalled();
  });

  it("keeps focus on the moved entry's Move button for the same direction", () => {
    const up = control('reorderMove', 'task:a:up');
    const down = control('reorderMove', 'task:a:down');
    const page = stubPage([up, down]);

    moveWithButton('up', { count: 3, handleId: 'task:a', index: 2, label: 'A' }, vi.fn());
    page.renderFrame();

    expect(up.focus).toHaveBeenCalledTimes(1);
    expect(down.focus).not.toHaveBeenCalled();
  });

  it('hands focus to the other Move button when the move reached the end of the list, which disables this one', () => {
    const up = control('reorderMove', 'task:a:up', true);
    const down = control('reorderMove', 'task:a:down');
    const page = stubPage([control('reorderMove', 'task:b:down'), up, down]);

    moveWithButton('up', { count: 3, handleId: 'task:a', index: 1, label: 'A' }, vi.fn());
    page.renderFrame();

    expect(up.focus).not.toHaveBeenCalled();
    expect(down.focus).toHaveBeenCalledTimes(1);
  });
});

describe('Move up and Move down buttons', () => {
  it('move one place and say where the entry went', () => {
    const move = vi.fn();

    expect(moveWithButton('down', { count: 3, handleId: 'x', index: 0, label: 'Prep' }, move)).toBe(
      'Moved Prep to position 2 of 3',
    );
    expect(move).toHaveBeenCalledWith(0, 1);
  });

  it('do nothing past either end', () => {
    const move = vi.fn();

    expect(moveWithButton('up', { count: 3, handleId: 'x', index: 0, label: 'Prep' }, move)).toBeNull();
    expect(moveWithButton('down', { count: 3, handleId: 'x', index: 2, label: 'Prep' }, move)).toBeNull();
    expect(move).not.toHaveBeenCalled();
  });
});
