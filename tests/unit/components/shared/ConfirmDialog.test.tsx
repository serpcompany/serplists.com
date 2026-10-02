import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { findElement } from '../../../support/elementTree';

const renderDialog = (pending: boolean) => {
  const onOpenChange = vi.fn();
  const dialog = ConfirmDialog({
    confirmLabel: 'Delete',
    description: 'Are you sure you want to delete this run?',
    onConfirm: vi.fn(),
    onOpenChange,
    open: true,
    pending,
    pendingLabel: 'Deleting...',
    title: 'Delete run',
  });
  const requestClose = dialog.props.onOpenChange as (open: boolean) => void;
  return { dialog, onOpenChange, requestClose };
};

describe('ConfirmDialog', () => {
  it('stays open while its action runs, so Escape or a click outside never hides an action still in flight', () => {
    const { onOpenChange, requestClose } = renderDialog(true);

    requestClose(false);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes when asked while no action runs', () => {
    const { onOpenChange, requestClose } = renderDialog(false);

    requestClose(false);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables Cancel and the action while the action runs, and the action names what is running', () => {
    const { dialog } = renderDialog(true);

    const cancel = findElement(dialog, (element) => element.props.children === 'Cancel');
    const action = findElement(dialog, (element) => element.props.variant === 'destructive');

    expect(cancel?.props.disabled).toBe(true);
    expect(action?.props.disabled).toBe(true);
    expect(action?.props.children).toBe('Deleting...');
  });
});
