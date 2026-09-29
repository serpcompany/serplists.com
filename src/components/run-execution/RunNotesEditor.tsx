import type { JSX } from 'react';
import { useState } from 'react';
import { Check, Loader2, MessageSquareText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// The draft lives in the run model (see noteDrafts.ts), not here, so it survives moving
// between tasks, and a save that returns while the user is still typing never replaces it.
interface RunNotesEditorProps {
  draft?: string;
  label: string;
  onDraftChange: (notes: string) => void;
  onSave: (notes: string) => Promise<boolean>;
  // For members whose Organization role cannot update the run.
  readOnly?: boolean;
  savedValue?: string;
}

export function RunNotesEditor({
  draft,
  label,
  onDraftChange,
  onSave,
  readOnly = false,
  savedValue = '',
}: RunNotesEditorProps): JSX.Element {
  const notes = draft ?? savedValue;
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const isDirty = notes !== savedValue;

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    setShowSaved(false);
    try {
      setShowSaved(await onSave(notes));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <Label className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4" />
        {label}
      </Label>
      <Textarea
        aria-label={label}
        onChange={(event) => {
          onDraftChange(event.target.value);
          setShowSaved(false);
        }}
        placeholder={readOnly ? undefined : 'Add links, outcomes, or context for this run...'}
        readOnly={readOnly}
        rows={3}
        value={notes}
      />
      {readOnly ? null : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {showSaved && !isDirty ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check className="h-3.5 w-3.5" /> Saved to this run
              </span>
            ) : (
              'Only this run is updated.'
            )}
          </span>
          <Button
            disabled={isSaving || !isDirty}
            onClick={() => void handleSave()}
            size="sm"
            type="button"
            variant="outline"
          >
            {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Save notes
          </Button>
        </div>
      )}
    </div>
  );
}
