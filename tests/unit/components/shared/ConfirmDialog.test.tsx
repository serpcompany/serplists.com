import type { ComponentProps } from 'react';
import { assert, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { findElement, findElementOf } from '../../../support/elementTree';

type CloseDetails = Parameters<NonNullable<ComponentProps<typeof AlertDialog>['onOpenChange']>>[1];

const anEscapeOrAClickOutside: CloseDetails = {
  reason: 'none',
  event: new Event('close'),
  cancel: () => {},
  allowPropagation: () => {},
  isCanceled: false,
  isPropagationAllowed: false,
  trigger: undefined,
  preventUnmountOnClose: () => {},
};

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
  const alertDialog = findElementOf(dialog, AlertDialog);
  const onAlertDialogOpenChange = alertDialog?.props.onOpenChange;
  assert.exists(onAlertDialogOpenChange);
  const requestClose = (open: boolean) => onAlertDialogOpenChange(open, anEscapeOrAClickOutside);
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
