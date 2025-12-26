import React from 'react';
import { Label } from './label';
import { Textarea } from './textarea';
import { Input } from './input';
import { Code } from 'lucide-react';

interface EmbedFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export const EmbedField: React.FC<EmbedFieldProps> = ({
  value,
  onValueChange,
  className = ''
}) => {
  const isUrl = value.startsWith('http://') || value.startsWith('https://');

  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="flex items-center gap-2">
        <Code className="h-4 w-4" />
        Embed Code or URL
      </Label>
      
      {isUrl ? (
        <Input
          type="url"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="https://example.com/embed-url"
        />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="<iframe src='...' width='560' height='315'></iframe>"
          rows={4}
          className="font-mono text-sm"
        />
      )}
      
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