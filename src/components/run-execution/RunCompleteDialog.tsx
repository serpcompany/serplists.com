import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createJustOpenedGuard, onSingleClick } from '@/lib/utils/repeatClick';

interface RunCompleteDialogProps {
  completing?: boolean;
  onComplete: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function RunCompleteDialog({ completing = false, onComplete, onOpenChange, open }: RunCompleteDialogProps) {
  const [{ markOpened, onOutsidePress }] = useState(() => createJustOpenedGuard());

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && details.reason === 'outside-press' && onOutsidePress(details.cancel)) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent ref={markOpened}>
        <DialogHeader>
          <DialogTitle>Complete this Run?</DialogTitle>
          <DialogDescription>
            Every task is done. Completing the Run freezes its tasks: they can no longer be ticked
            or unticked.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            disabled={completing}
            onClick={onSingleClick(() => onOpenChange(false))}
            type="button"
            variant="outline"
          >
            Not yet
          </Button>
          <Button disabled={completing} onClick={onSingleClick(onComplete)} type="button">
            Complete Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
