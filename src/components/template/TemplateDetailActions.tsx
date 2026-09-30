import { Copy, Download, MoreHorizontal, Pencil, PlayCircle, Share2, Trash2 } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CopyTemplateButton } from '@/features/template-detail/copyTemplateButton';

import { Link } from '@/components/navigation/Link';

type TemplateDetailActionsProps = {
  // Roles that can edit get Share, Edit and the actions menu; others the copy button.
  canEdit: boolean;
  canShare: boolean;
  canDuplicate: boolean;
  copyButton: CopyTemplateButton;
  editHref: string;
  exportDisabled: boolean;
  exportLabel: string;
  isCloning: boolean;
  isCreatingShare: boolean;
  // Share and a visibility change must not race on the same template version.
  isChangingVisibility: boolean;
  isSignedIn: boolean;
  // Where "Log in to copy template" goes: the login page with this page as the return path.
  loginHref: string;
  onClone: () => void;
  onDelete: () => void;
  onExport: () => void;
  onShare: () => void;
  onStartRun: () => void;
  showStartRun: boolean;
};

// Template detail's header actions: Share and Edit (or a copy button), Start Run, and the
// Template actions menu (Duplicate, Export JSON, Delete).
export function TemplateDetailActions({
  canDuplicate,
  canEdit,
  canShare,
  copyButton,
  editHref,
  exportDisabled,
  exportLabel,
  isChangingVisibility,
  isCloning,
  isCreatingShare,
  isSignedIn,
  loginHref,
  onClone,
  onDelete,
  onExport,
  onShare,
  onStartRun,
  showStartRun,
}: TemplateDetailActionsProps) {
  return (
    <>
      {canEdit ? (
        <>
          {canShare ? (
            <Button disabled={isChangingVisibility} onClick={onShare} variant="outline">
              <Share2 data-icon="inline-start" />
              {isCreatingShare ? 'Creating...' : 'Share'}
            </Button>
          ) : null}
          <Link href={editHref} className={buttonVariants({ variant: 'outline' })}>
            <Pencil data-icon="inline-start" />
            Edit
          </Link>
        </>
      ) : isSignedIn ? (
        copyButton.visible ? (
          <Button disabled={copyButton.disabled} onClick={onClone} variant="outline">
            <Copy data-icon="inline-start" />
            {copyButton.label}
          </Button>
        ) : null
      ) : copyButton.visible ? (
        <Link href={loginHref} className={buttonVariants({ variant: 'outline' })}>
          Log in to copy template
        </Link>
      ) : null}

      {showStartRun ? (
        <Button onClick={onStartRun}>
          <PlayCircle data-icon="inline-start" />
          Start Run
        </Button>
      ) : null}

      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button aria-label="Template actions" size="icon" variant="ghost" />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canDuplicate ? (
              <DropdownMenuItem disabled={isCloning} onClick={onClone}>
                <Copy />
                {isCloning ? 'Duplicating...' : 'Duplicate'}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem disabled={exportDisabled} onClick={onExport}>
              <Download />
              {exportLabel}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} variant="destructive">
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
