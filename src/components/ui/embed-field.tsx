import React from 'react';
import { Code } from 'lucide-react';

import { Field, FieldDescription, FieldLabel } from './field';
import { Textarea } from './textarea';
import { cn } from '@/lib/utils';
import { getEmbedLinkUrl } from '@/lib/utils/embedLink';

interface EmbedFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

const URL_PREFIX = /^https?:\/\//i;

// An embed block's value: a URL or iframe code, with what viewers will get below it.
// Built from the shadcn Field and Textarea.
export const EmbedField: React.FC<EmbedFieldProps> = ({
  value,
  onValueChange,
  className,
}) => {
  const fieldId = React.useId();
  const isUrl = URL_PREFIX.test(value.trimStart());
  // What viewers get: a link to this URL (or to the src of iframe code), else the text.
  const embedLink = getEmbedLinkUrl(value);

  // One textarea for both modes: swapping element types when the value crosses
  // "https://" would remount the control and drop focus, the caret and undo history.
  // Only its props follow the mode, and newlines in embed code are kept.
  return (
    <Field className={className}>
      <FieldLabel htmlFor={fieldId}>
        <Code />
        Embed Code or URL
      </FieldLabel>

      <Textarea
        id={fieldId}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={
          isUrl
            ? 'https://example.com/embed-url'
            : "<iframe src='...' width='560' height='315'></iframe>"
        }
        rows={isUrl ? 1 : 4}
        inputMode={isUrl ? 'url' : 'text'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn(isUrl ? 'min-h-9' : 'font-mono')}
      />

      <FieldDescription>
        Enter a URL or iframe embed code. Viewers get a link to the URL.
      </FieldDescription>

      {embedLink ? (
        <p className="rounded-lg bg-muted p-2 text-sm break-all text-muted-foreground">
          Embed URL: {embedLink}
        </p>
      ) : value.trim() ? (
        <FieldDescription>
          No web address found, so viewers will see it as text.
        </FieldDescription>
      ) : null}
    </Field>
  );
};
