import type { ComponentProps } from 'react';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ShareLinkDialog } from '@/components/shared/ShareLinkDialog';
import { RunNameDialog } from '@/components/ui/run-name-dialog';

import { TransferTemplateDialog } from './TransferTemplateDialog';

type DialogState = { open: boolean; onOpenChange: (open: boolean) => void };

type TemplateDetailDialogsProps = {
  deleteDialog: DialogState & { onConfirm: () => void; pending: boolean };
  runDialog: DialogState & { loading: boolean; onConfirm: (runName: string) => void | Promise<void> };
  shareDialog: DialogState & { url: string };
  templateTitle: string;
  transferDialog: ComponentProps<typeof TransferTemplateDialog>;
};

export function TemplateDetailDialogs({
  deleteDialog,
  runDialog,
  shareDialog,
  templateTitle,
  transferDialog,
}: TemplateDetailDialogsProps) {
  return (
    <>
      <ConfirmDialog
        confirmLabel="Delete"
        description={`Are you sure you want to delete "${templateTitle}"?`}
        onConfirm={deleteDialog.onConfirm}
        onOpenChange={deleteDialog.onOpenChange}
        open={deleteDialog.open}
        pending={deleteDialog.pending}
        pendingLabel="Deleting..."
        title="Delete template"
      />

      <ShareLinkDialog
        copiedMessage="Public link copied"
        description="Share this template with others. They can view it and copy it into their library."
        onOpenChange={shareDialog.onOpenChange}
        open={shareDialog.open}
        title="Share Template"
        url={shareDialog.url}
      />

      <RunNameDialog
        open={runDialog.open}
        onOpenChange={runDialog.onOpenChange}
        templateTitle={templateTitle}
        onConfirm={runDialog.onConfirm}
        loading={runDialog.loading}
      />

      <TransferTemplateDialog {...transferDialog} />
    </>
  );
}
