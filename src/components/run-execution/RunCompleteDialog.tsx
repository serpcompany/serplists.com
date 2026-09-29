import { useState } from 'react';
import { Check, CheckCircle } from 'lucide-react';

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
  isSharedRun: boolean;
  onComplete: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

// Opens when the last task is ticked, often by a click whose double click is not over yet.
// The rest of that double click lands on the overlay or on this dialog's button, so it
// neither closes the dialog nor completes the run (see repeatClick.ts).
export function RunCompleteDialog({ isSharedRun, onComplete, onOpenChange, open }: RunCompleteDialogProps) {
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
          <DialogTitle>Checklist Completed!</DialogTitle>
          <DialogDescription>
            Congratulations! You have completed all items in this checklist.
          </DialogDescription>
        </DialogHeader>
        <div className="my-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onSingleClick(onComplete)}>
            <Check className="mr-2 h-4 w-4" />
            {isSharedRun ? 'Return to Public Runs' : 'Return to Dashboard'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
