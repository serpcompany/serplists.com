import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { buildDefaultRunName, resolveRunName, RUN_TITLE_MAX_LENGTH } from "@/lib/runs/runName";
import { createJustOpenedGuard, isRepeatClick } from "@/lib/utils/repeatClick";

const RUN_NAME_FIELD_ID = "run-name";

interface RunNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateTitle: string;
  onConfirm: (name: string) => void | Promise<void>;
  loading?: boolean;
}

export const RunNameDialog: React.FC<RunNameDialogProps> = ({
  open,
  onOpenChange,
  templateTitle,
  onConfirm,
  loading = false,
}) => {
  const [runName, setRunName] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setRunName("");
  }
  const [{ markOpened, handleOpenChange }] = useState(() => createJustOpenedGuard());

  const defaultName = buildDefaultRunName(templateTitle);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    void onConfirm(resolveRunName(runName, templateTitle));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange(loading, onOpenChange)}>
      <DialogContent className="sm:max-w-md" closeDisabled={loading} ref={markOpened}>
        <DialogHeader>
          <DialogTitle>Start a Run</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={RUN_NAME_FIELD_ID}>Run name</FieldLabel>
            <Input
              id={RUN_NAME_FIELD_ID}
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              placeholder={defaultName}
              maxLength={RUN_TITLE_MAX_LENGTH}
              disabled={loading}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              onClick={(event) => {
                if (isRepeatClick(event)) event.preventDefault();
              }}
            >
              {loading ? "Starting…" : "Start Run"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
