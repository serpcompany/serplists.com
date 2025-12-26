import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Label } from './label';
import { FileText } from 'lucide-react';
import { Page } from '@/types/page';

interface PageSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  pages: Page[];
  className?: string;
}

export const PageSelector: React.FC<PageSelectorProps> = ({
  value,
  onValueChange,
  pages,
  className = ''
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="flex items-center gap-2">
        <FileText className="h-4 w-4" />
        Select Page
      </Label>
      
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose a page to embed..." />
        </SelectTrigger>
        <SelectContent>
          {pages.map((page: { id: unknown; title: unknown; description: unknown }) => (
            <SelectItem key={page.id} value={page.id}>
              <div className="flex flex-col">
                <span className="font-medium">{page.title}</span>
                {page.description && (
                  <span className="text-xs text-muted-foreground">{page.description}</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {pages.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No pages available. Create some pages first to embed them here.
        </p>
      )}
    </div>
  );
};