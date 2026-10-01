import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

type ChildrenProps = { children?: ReactNode };
type ButtonProps = ChildrenProps & { disabled?: boolean; onClick?: () => void };

const PassThrough = ({ children }: ChildrenProps) => <>{children}</>;

export const alertDialogInPlace = {
  AlertDialog: ({ open, children }: ChildrenProps & { open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  AlertDialogAction: ({ children, disabled, onClick }: ButtonProps) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children, disabled }: ButtonProps) => (
    <button disabled={disabled} type="button">
      {children}
    </button>
  ),
  AlertDialogContent: PassThrough,
  AlertDialogDescription: ({ children }: ChildrenProps) => <p>{children}</p>,
  AlertDialogFooter: PassThrough,
  AlertDialogHeader: PassThrough,
  AlertDialogTitle: ({ children }: ChildrenProps) => <h2>{children}</h2>,
};

export const dialogInPlace = {
  Dialog: ({ open, children }: ChildrenProps & { open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: PassThrough,
  DialogDescription: ({ children }: ChildrenProps) => <p>{children}</p>,
  DialogFooter: PassThrough,
  DialogHeader: PassThrough,
  DialogTitle: ({ children }: ChildrenProps) => <h2>{children}</h2>,
};

export const selectWithoutPopup = {
  Select: PassThrough,
  SelectContent: () => null,
  SelectItem: PassThrough,
  SelectTrigger: PassThrough,
  SelectValue: () => null,
};

export const dropdownMenuRenderedOpen = {
  DropdownMenu: ({ children }: ChildrenProps) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: ChildrenProps) => <button type="button">{children}</button>,
  DropdownMenuContent: ({ children }: ChildrenProps) => <div role="menu">{children}</div>,
  DropdownMenuGroup: ({ children }: ChildrenProps) => <div role="group">{children}</div>,
  DropdownMenuItem: ({ children, render }: ChildrenProps & { render?: ReactElement }) =>
    isValidElement(render) ? (
      cloneElement(render as ReactElement<Record<string, unknown>>, { role: 'menuitem' }, children)
    ) : (
      <div role="menuitem">{children}</div>
    ),
  DropdownMenuLabel: ({ children }: ChildrenProps) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
};

export const dropdownMenuItemsAsButtons = {
  DropdownMenu: PassThrough,
  DropdownMenuContent: PassThrough,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: PassThrough,
  DropdownMenuItem: ({ children, disabled, onClick }: ButtonProps) => (
    <button type="button" role="menuitem" aria-disabled={disabled ? 'true' : undefined} onClick={onClick}>
      {children}
    </button>
  ),
};
