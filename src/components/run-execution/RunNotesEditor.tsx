import type { JSX } from 'react';
import { useId, useState } from 'react';
import { Check, MessageSquareText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
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

// A task's notes: a labelled textarea, and a line that says where they are saved with the
// Save notes button.
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
  const textareaId = useId();

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
    <Field>
      <FieldLabel htmlFor={textareaId}>
        <MessageSquareText aria-hidden="true" className="size-4" />
        {label}
      </FieldLabel>
      <Textarea
        aria-label={label}
        id={textareaId}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {showSaved && !isDirty ? (
              <span className="inline-flex items-center gap-1 text-foreground">
                <Check aria-hidden="true" className="size-3.5" /> Saved to this run
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
            {isSaving ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
            Save notes
          </Button>
        </div>
      )}
    </Field>
  );
}
