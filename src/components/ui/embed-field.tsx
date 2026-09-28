import React from 'react';
import { Label } from './label';
import { Textarea } from './textarea';
import { Code } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmbedFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

const URL_PREFIX = /^https?:\/\//i;

export const EmbedField: React.FC<EmbedFieldProps> = ({
  value,
  onValueChange,
  className = ''
}) => {
  const fieldId = React.useId();
  const isUrl = URL_PREFIX.test(value.trimStart());

  // One textarea for both modes: swapping element types when the value crosses
  // "https://" would remount the control and drop focus, the caret and undo history.
  // Only its props follow the mode, and newlines in embed code are kept.
  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={fieldId} className="flex items-center gap-2">
        <Code className="h-4 w-4" />
        Embed Code or URL
      </Label>

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
        className={cn(isUrl ? 'min-h-9' : 'font-mono text-sm')}
      />

      <p className="text-xs text-muted-foreground">
        Enter an embed URL or HTML embed code (iframe, script, etc.)
      </p>

      {/* Preview for embed URLs */}
      {value && isUrl && (
        <div className="border rounded-lg p-2 bg-muted">
          <p className="text-sm text-muted-foreground">
            Embed URL: {value}
          </p>
        </div>
      )}
    </div>
  );
};
