import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RunPageHeader } from '@/components/run-execution/RunPageHeader';
import { Button } from '@/components/ui/button';

import { findAllElements, type AnyElement } from '../../../support/elementTree';

type HeaderProps = Parameters<typeof RunPageHeader>[0];

const headerProps = (overrides: Partial<HeaderProps> = {}): HeaderProps => ({
  canUpdateRun: true,
  description: '2 of 3 tasks finished',
  editTitle: 'Launch',
  finishRunButton: null,
  isCompleted: false,
  isCreatingShare: false,
  isEditingTitle: false,
  isPublic: false,
  onBack: vi.fn(),
  onCancelRename: vi.fn(),
  onEditTitleChange: vi.fn(),
  onSaveTitle: vi.fn(),
  onShare: vi.fn(),
  onStartRename: vi.fn(),
  onStopSharing: vi.fn(async () => ({ kind: 'ok' as const })),
  progress: 66,
  roleUnavailable: false,
  title: 'Launch',
  titleChanged: true,
  ...overrides,
});

const clickButton = (props: HeaderProps, label: string, detail: number) => {
  const header = RunPageHeader(props) as AnyElement;
  const [button] = findAllElements(
    header.props.actions as ReactNode,
    (element) => element.type === Button && [element.props.children].flat().includes(label),
  );
  expect(button, label).toBeDefined();
  (button!.props.onClick as (event: { detail: number }) => void)({ detail });
};

describe("RunPageHeader rename buttons, which take each other's place under the pointer", () => {
  it('opens the title field on a single click on Rename and ignores the second click of a double click', () => {
    const props = headerProps();

    clickButton(props, 'Rename', 2);
    expect(props.onStartRename).not.toHaveBeenCalled();

    clickButton(props, 'Rename', 1);
    expect(props.onStartRename).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Save title', 'onSaveTitle'],
    ['Cancel', 'onCancelRename'],
  ] as const)('acts on a single click on %s and ignores the rest of the double click that opened the field', (label, handler) => {
    const props = headerProps({ isEditingTitle: true });

    clickButton(props, label, 2);
    expect(props[handler]).not.toHaveBeenCalled();

    clickButton(props, label, 1);
    expect(props[handler]).toHaveBeenCalledTimes(1);
  });
});
