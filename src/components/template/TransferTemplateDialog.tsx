import { useState } from 'react';

import { LabeledSelect } from '@/components/shared/LabeledSelect';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createJustOpenedGuard, isRepeatClick } from '@/lib/utils/repeatClick';

type TransferTemplateDialogProps = {
  isPublic: boolean;
  onConfirm: (teamId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizations: readonly { id: string; name: string }[];
  pending: boolean;
  templateTitle: string;
};

export function TransferTemplateDialog({
  isPublic,
  onConfirm,
  onOpenChange,
  open,
  organizations,
  pending,
  templateTitle,
}: TransferTemplateDialogProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setChosen(null);
  }
  const [{ markOpened, handleOpenChange }] = useState(() => createJustOpenedGuard());
  const teamId = organizations.some((organization) => organization.id === chosen)
    ? chosen
    : (organizations[0]?.id ?? null);
  const labels = Object.fromEntries(organizations.map((organization) => [organization.id, organization.name]));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange(pending, onOpenChange)}>
      <DialogContent className="sm:max-w-md" closeDisabled={pending} ref={markOpened}>
        <DialogHeader>
          <DialogTitle>Transfer to Organization</DialogTitle>
          <DialogDescription>
            {isPublic
              ? `Make "${templateTitle}" private first: public Templates can't be transferred to an Organization yet.`
              : `Move "${templateTitle}" out of Personal and into an Organization, where its members can use it.`}
          </DialogDescription>
        </DialogHeader>
        {isPublic ? (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              Close
            </Button>
          </DialogFooter>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pending && teamId) onConfirm(teamId);
            }}
          >
            {teamId ? (
              <LabeledSelect
                className="w-full"
                id="transfer-organization"
                label="Organization"
                labels={labels}
                onValueChange={setChosen}
                value={teamId}
              />
            ) : null}
            <p className="text-sm text-muted-foreground">
              Runs you already started from it stay in Personal and no longer receive its changes.
            </p>
            <DialogFooter>
              <Button disabled={pending} onClick={() => onOpenChange(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                disabled={pending || !teamId}
                onClick={(event) => {
                  if (isRepeatClick(event)) event.preventDefault();
                }}
                type="submit"
              >
                {pending ? 'Transferring...' : 'Transfer'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
