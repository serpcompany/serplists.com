import React, { isValidElement, type ComponentProps } from 'react';
import { vi } from 'vitest';

import type { Button } from '@/components/ui/button';

import { handlerIn } from './elementTree';

type ButtonProps = ComponentProps<typeof Button>;

type RecordedButton = { children?: unknown; onClick?: unknown };

const recorded = vi.hoisted(() => ({ buttons: new Array<RecordedButton>() }));

vi.mock('@/components/ui/button', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/button')>();
  return {
    ...actual,
    Button: (props: ButtonProps) => {
      recorded.buttons.push(props);
      return <actual.Button {...props} />;
    },
  };
});

const textOf = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return isValidElement<{ children?: unknown }>(node) ? textOf(node.props.children) : '';
};

export const clickTheLastButtonReading = async (text: string): Promise<void> => {
  const button = recorded.buttons.filter((props) => textOf(props.children).includes(text)).at(-1);
  if (!button) throw new Error(`Expected a rendered button reading "${text}", but there is none.`);
  await handlerIn({ onClick: button.onClick }, 'onClick')();
};
