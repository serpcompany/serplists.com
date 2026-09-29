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

// The Run name field's id, which its visible label names.
export const RUN_NAME_FIELD_ID = "run-name";

interface RunNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateTitle: string;
  // The page closes the dialog once the run starts; on failure it stays open.
  onConfirm: (name: string) => void | Promise<void>;
  loading?: boolean;
}

// The one way to start a Run (My Templates, template detail and the public template page):
// "Start a Run", a labelled "Run name" field that suggests the default name, and Start Run.
// A Start Run button opens it, often with a double click whose second click lands on the
// overlay; that click neither closes the dialog nor starts a second run (repeatClick.ts).
export const RunNameDialog: React.FC<RunNameDialogProps> = ({
  open,
  onOpenChange,
  templateTitle,
  onConfirm,
  loading = false,
}) => {
  const [runName, setRunName] = useState("");
  // The name is cleared when the dialog closes (Cancel, Escape, or a started run), never on
  // submit, so a start that fails keeps what the user typed for the retry.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setRunName("");
  }
  const [{ markOpened, onOutsidePress }] = useState(() => createJustOpenedGuard());

  // Shortens a long template title so the default fits the run title limit.
  const defaultName = buildDefaultRunName(templateTitle);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Enter while the run is starting would start a second one.
    if (loading) return;
    void onConfirm(resolveRunName(runName, templateTitle));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && details.reason === "outside-press" && onOutsidePress(details.cancel)) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md" ref={markOpened}>
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
              // The second click of a double click submits nothing more.
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
