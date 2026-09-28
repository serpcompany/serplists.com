import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildDefaultRunName, resolveRunName, RUN_TITLE_MAX_LENGTH } from "@/lib/runs/runName";

interface RunNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateTitle: string;
  // The page closes the dialog once the run starts; on failure it stays open.
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
  // The name is cleared when the dialog closes (Cancel, Escape, or a started run), never on
  // submit, so a start that fails keeps what the user typed for the retry.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setRunName("");
  }

  // Shortens a long template title so the default fits the run title limit.
  const defaultName = buildDefaultRunName(templateTitle);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Enter while the run is starting would start a second one.
    if (loading) return;
    void onConfirm(resolveRunName(runName, templateTitle));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Name Your Checklist Run</DialogTitle>
          <DialogDescription>
            Give your new checklist run a descriptive name to help you track progress.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="runName">Run Name</Label>
              <Input
                id="runName"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                placeholder={defaultName}
                maxLength={RUN_TITLE_MAX_LENGTH}
                disabled={loading}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Start Checklist"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};