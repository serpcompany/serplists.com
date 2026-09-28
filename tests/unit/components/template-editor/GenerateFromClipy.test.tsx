import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GenerateFromClipy } from '@/components/template-editor/GenerateFromClipy';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

// Unit tests run in node with no DOM, so the component is called as a function with
// React's hooks stubbed: state setters are recorded, refs persist for one render, and
// effects are collected so a test can run their cleanup (the unmount).
const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  sets: [] as unknown[],
  url: 'https://clipy.online/video/abc',
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const stubs = {
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
    useRef: <T,>(initial: T) => ({ current: initial }),
    useState: <T,>(initial: T) => [
      initial === '' ? hooks.url : initial,
      (next: unknown) => {
        hooks.sets.push(next);
      },
    ],
  };
  return { ...actual, ...stubs, default: { ...actual, ...stubs } };
});

vi.mock('@/lib/api', () => ({ api: { generateTemplateFromClipy: vi.fn() } }));

type AnyElement = React.ReactElement<Record<string, unknown>>;

function findButton(node: React.ReactNode): AnyElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findButton(child);
      if (match) return match;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const element = node as AnyElement;
  if (typeof element.props.onClick === 'function') return element;
  return findButton(element.props.children as React.ReactNode);
}

const draft = buildTemplateEditorFormValues({ title: 'Clipy draft' });

const render = (props: Partial<React.ComponentProps<typeof GenerateFromClipy>>) => {
  const tree = GenerateFromClipy({ onGenerated: vi.fn(), ...props });
  const button = findButton(tree);
  if (!button) throw new Error('Generate button not found');
  return () => (button.props.onClick as () => void)();
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  hooks.effects.length = 0;
  hooks.sets.length = 0;
});

// Generating replaced the whole editor (title, sections, everything typed) with the
// Clipy draft, with no question asked, and edits typed during the request were lost.
describe('GenerateFromClipy', () => {
  it('asks before generating and leaves everything as it is when the user declines', async () => {
    const generate = vi.fn().mockResolvedValue({ draft });
    const onGenerated = vi.fn();
    const onGeneratingChange = vi.fn();

    render({ confirmReplace: () => false, generate, onGenerated, onGeneratingChange })();
    await flush();

    expect(generate).not.toHaveBeenCalled();
    expect(onGenerated).not.toHaveBeenCalled();
    expect(onGeneratingChange).not.toHaveBeenCalled();
    // No error shown, and the URL stays as typed.
    expect(hooks.sets).toEqual([]);
  });

  it('generates and hands over the draft once the user agrees', async () => {
    const generate = vi.fn().mockResolvedValue({ draft });
    const onGenerated = vi.fn();
    const onGeneratingChange = vi.fn();

    render({ confirmReplace: () => true, generate, onGenerated, onGeneratingChange })();
    await flush();

    expect(generate).toHaveBeenCalledWith('https://clipy.online/video/abc');
    expect(onGenerated).toHaveBeenCalledWith(draft);
    // The editor is locked while the request runs, so nothing typed meanwhile is lost.
    expect(onGeneratingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('asks before the request, not after it', async () => {
    const order: string[] = [];
    const generate = vi.fn(async () => {
      order.push('generate');
      return { draft };
    });

    render({
      confirmReplace: () => {
        order.push('confirm');
        return true;
      },
      generate,
    })();
    await flush();

    expect(order).toEqual(['confirm', 'generate']);
  });

  it('drops a draft that arrives after the editor closed', async () => {
    let resolve: (value: { draft: typeof draft }) => void = () => undefined;
    const generate = vi.fn(
      () =>
        new Promise<{ draft: typeof draft }>((done) => {
          resolve = done;
        }),
    );
    const onGenerated = vi.fn();

    render({ confirmReplace: () => true, generate, onGenerated })();
    // Unmount: run each effect and its cleanup.
    for (const effect of hooks.effects) {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanup();
    }
    resolve({ draft });
    await flush();

    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('keeps generating without a question when no confirmReplace is given', async () => {
    const generate = vi.fn().mockResolvedValue({ draft });
    const onGenerated = vi.fn();

    render({ generate, onGenerated })();
    await flush();

    expect(onGenerated).toHaveBeenCalledWith(draft);
  });
});
