import { assert, describe, expect, it } from 'vitest';

import { DashboardPageHeader } from '@/components/dashboard/DashboardContentShell';
import { RunPageHeader } from '@/components/run-execution/RunPageHeader';
import { Button } from '@/components/ui/button';

import { runPageHeaderProps, type RunPageHeaderProps } from '../../../fixtures/runPageHeader';
import { findAllElements, findElementOf, handlerOf } from '../../../support/elementTree';

type HeaderProps = RunPageHeaderProps;
const headerProps = runPageHeaderProps;

const clickButton = (props: HeaderProps, label: string, detail: number) => {
  const header = findElementOf(RunPageHeader(props), DashboardPageHeader);
  assert.exists(header, 'the page header');
  const [button] = findAllElements(
    header.props.actions,
    (element) => element.type === Button && [element.props.children].flat().includes(label),
  );
  assert.exists(button, label);
  handlerOf(button, 'onClick')({ detail });
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
