import { useEffect, useState } from 'react';
import { Check, Loader2, MessageSquareText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface RunNotesEditorProps {
  initialValue?: string;
  label: string;
  onSave: (notes: string) => Promise<boolean>;
}

export function RunNotesEditor({
  initialValue = '',
  label,
  onSave,
}: RunNotesEditorProps): JSX.Element {
  const [notes, setNotes] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    setNotes(initialValue);
  }, [initialValue]);

  const isDirty = notes !== initialValue;

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
          setNotes(event.target.value);
          setShowSaved(false);
        }}
        placeholder="Add links, outcomes, or context for this run..."
        rows={3}
        value={notes}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {showSaved ? (
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
    </div>
  );
}
