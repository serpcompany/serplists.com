import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { copyTextToClipboard } from '@/lib/clipboard';

// A Run's share link: what anyone who has it may do (functions/api/handlers/checklists-shared.ts).
export const RUN_SHARE_LINK_DESCRIPTION =
  'Anyone with this link can open this Run without signing in, tick its tasks, add notes and complete it.';

type ShareLinkFieldProps = {
  copiedMessage: string;
  url: string;
};

// Shows a created share link with a Copy button. The copy runs straight from the click,
// which Safari requires, and the link stays visible if the browser refuses the copy.
export function ShareLinkField({ copiedMessage, url }: ShareLinkFieldProps) {
  const handleCopy = async () => {
    if (await copyTextToClipboard(url)) {
      toast.success(copiedMessage);
      return;
    }
    toast.error("Couldn't copy the link. Select it and copy it manually.");
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label="Share link"
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="border-border bg-muted"
      />
      <Button
        aria-label="Copy share link"
        variant="outline"
        size="icon"
        onClick={() => void handleCopy()}
        className="shrink-0 border-border"
        type="button"
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

type ShareLinkDialogProps = ShareLinkFieldProps & {
  description: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
};

export function ShareLinkDialog({
  copiedMessage,
  description,
  onOpenChange,
  open,
  title,
  url,
}: ShareLinkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <ShareLinkField copiedMessage={copiedMessage} url={url} />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border"
            type="button"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
