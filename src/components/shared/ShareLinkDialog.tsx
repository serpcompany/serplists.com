import { useId } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { copyTextToClipboard } from '@/lib/clipboard';

// A Run's share link: what anyone who has it may do (functions/api/handlers/checklists-shared.ts).
export const RUN_SHARE_LINK_DESCRIPTION =
  'Anyone with this link can open this Run without signing in, tick its tasks, add notes and complete it.';

type ShareLinkFieldProps = {
  copiedMessage: string;
  url: string;
};

// Shows a created share link with a Copy button in the field (a shadcn InputGroup). The copy
// runs straight from the click, which Safari requires, and the link stays visible if the
// browser refuses the copy.
export function ShareLinkField({ copiedMessage, url }: ShareLinkFieldProps) {
  const inputId = useId();

  const handleCopy = async () => {
    if (await copyTextToClipboard(url)) {
      toast.success(copiedMessage);
      return;
    }
    toast.error("Couldn't copy the link. Select it and copy it manually.");
  };

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>Share link</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={inputId}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Copy share link" onClick={() => void handleCopy()} size="icon-xs">
            <Copy />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ShareLinkField copiedMessage={copiedMessage} url={url} />
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
