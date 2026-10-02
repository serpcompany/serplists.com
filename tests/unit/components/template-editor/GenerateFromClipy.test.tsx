import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GenerateFromClipy } from '@/components/template-editor/GenerateFromClipy';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

import { findElement, handlerOf } from '../../../support/elementTree';

const stubbedHooks = vi.hoisted(() => ({
  collectedEffects: [] as Array<() => void | (() => void)>,
  stateSetterCalls: [] as unknown[],
  typedClipyUrl: 'https://clipy.online/video/abc',
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const stubs = {
    useEffect: (effect: () => void | (() => void)) => {
      stubbedHooks.collectedEffects.push(effect);
    },
    useRef: <T,>(initial: T) => ({ current: initial }),
    useState: <T,>(initial: T) => [
      initial === '' ? stubbedHooks.typedClipyUrl : initial,
      (next: unknown) => {
        stubbedHooks.stateSetterCalls.push(next);
      },
    ],
  };
  return { ...actual, ...stubs, default: { ...actual, ...stubs } };
});

vi.mock('@/lib/api', () => ({ api: { generateTemplateFromClipy: vi.fn() } }));

const draft = buildTemplateEditorFormValues({ title: 'Clipy draft' });

const render = (props: Partial<React.ComponentProps<typeof GenerateFromClipy>>) => {
  const tree = GenerateFromClipy({ onGenerated: vi.fn(), ...props });
  const button = findElement(tree, (element) => typeof element.props.onClick === 'function');
  if (!button) throw new Error('Generate button not found');
  return () => handlerOf(button, 'onClick')();
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const runEffectsThenUnmount = () => {
  for (const effect of stubbedHooks.collectedEffects) {
    const cleanup = effect();
    if (typeof cleanup === 'function') cleanup();
  }
};

beforeEach(() => {
  stubbedHooks.collectedEffects.length = 0;
  stubbedHooks.stateSetterCalls.length = 0;
});

describe('GenerateFromClipy, whose draft replaces the whole editor', () => {
  it('asks before generating and leaves everything as it is, with no error and the URL as typed, when the user declines', async () => {
    const generate = vi.fn().mockResolvedValue({ draft });
    const onGenerated = vi.fn();
    const onGeneratingChange = vi.fn();

    render({ confirmReplace: () => false, generate, onGenerated, onGeneratingChange })();
    await flush();

    expect(generate).not.toHaveBeenCalled();
    expect(onGenerated).not.toHaveBeenCalled();
    expect(onGeneratingChange).not.toHaveBeenCalled();
    expect(stubbedHooks.stateSetterCalls).toEqual([]);
  });

  it('generates and hands over the draft once the user agrees, locking the editor while the request runs so nothing typed meanwhile is lost', async () => {
    const generate = vi.fn().mockResolvedValue({ draft });
    const onGenerated = vi.fn();
    const onGeneratingChange = vi.fn();

    render({ confirmReplace: () => true, generate, onGenerated, onGeneratingChange })();
    await flush();

    expect(generate).toHaveBeenCalledWith('https://clipy.online/video/abc');
    expect(onGenerated).toHaveBeenCalledWith(draft);
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
    runEffectsThenUnmount();
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
