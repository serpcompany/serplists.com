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
import { RUN_TITLE_MAX } from "@/lib/schemas/templateLimits";

/** "<template title> - <start time>", with the title shortened so the name fits the run title limit. */
export const buildDefaultRunName = (templateTitle: string, startedAt: Date = new Date()): string => {
  const suffix = ` - ${startedAt.toLocaleString()}`;
  return `${templateTitle.slice(0, Math.max(0, RUN_TITLE_MAX - suffix.length)).trimEnd()}${suffix}`;
};

interface RunNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateTitle: string;
  onConfirm: (name: string) => void;
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
  
  const defaultName = buildDefaultRunName(templateTitle);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = runName.trim() || defaultName;
    onConfirm(finalName);
    setRunName("");
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
                maxLength={RUN_TITLE_MAX}
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