import { ArrowLeft, Eye, Loader2, MoreHorizontal, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TemplateHeaderProps {
  isEditing: boolean;
  isSaving: boolean;
  title: string;
  templateSlug?: string;
  onCancel: () => void;
  onSave: () => void;
  onPreview?: () => void;
}

export const TemplateHeader = ({
  isEditing,
  isSaving,
  title,
  onCancel,
  onSave,
  onPreview,
}: TemplateHeaderProps): JSX.Element => {
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label="Back to templates"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {title || 'Untitled Template'}
          </span>
          {isEditing ? (
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Editing
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onPreview ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onPreview}
            className="text-muted-foreground hover:text-foreground"
            type="button"
          >
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
        ) : null}

        <Button
          variant="default"
          size="sm"
          onClick={onSave}
          disabled={isSaving}
          className="bg-foreground text-background hover:bg-foreground/90"
          type="button"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save
            </>
          )}
        </Button>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              type="button"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCancel}>Discard changes</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
