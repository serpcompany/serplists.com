import { describe, expect, it, vi } from 'vitest';

import {
  getKeyboardMoveIndex,
  handleKeyboardReorder,
  moveArrayEntry,
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
