import type { JSX, ReactNode } from 'react';
import { ArrowLeft, Eye, MoreHorizontal, Save } from 'lucide-react';

import { PageContainer } from '@/components/layout/page-shell';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';

interface TemplateHeaderProps {
  isEditing: boolean;
  isSaving: boolean;
  // A file is still uploading: saving now would store the block without it.
  isUploading?: boolean;
  // A Clipy draft is generating: it replaces the form when it arrives.
  isGenerating?: boolean;
  title: string;
  templateSlug?: string;
  onCancel: () => void;
  onSave: () => void;
  onPreview?: () => void;
  // The button that opens the outline below lg, where it is not beside the form.
  outlineTrigger?: ReactNode;
}

// The editor's top bar, which sticks under the console's top bar: back, the draft's title, and
// Preview, Save, the theme and More actions. On a phone Preview moves into More actions and the
// theme toggle stays in the sidebar, so the title and Save keep their room.
export const TemplateHeader = ({
  isEditing,
  isSaving,
  isUploading = false,
  isGenerating = false,
  title,
  onCancel,
  onSave,
  onPreview,
  outlineTrigger,
}: TemplateHeaderProps): JSX.Element => {
  return (
    <header className="sticky top-14 z-30 border-b bg-background" data-template-editor-header="true">
      <PageContainer className="flex h-14 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label="Back to templates"
          className="-ml-2 shrink-0"
        >
          <ArrowLeft />
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-sm font-medium">{title || 'Untitled Template'}</h1>
          {isEditing ? (
            <Badge className="hidden sm:inline-flex" variant="secondary">
              Editing
            </Badge>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {outlineTrigger}

          {onPreview ? (
            <Button
              variant="ghost"
              onClick={onPreview}
              className="hidden sm:inline-flex"
              type="button"
            >
              <Eye data-icon="inline-start" />
              Preview
            </Button>
          ) : null}

          <Button
            onClick={onSave}
            disabled={isSaving || isUploading || isGenerating}
            type="button"
          >
            {isSaving ? (
              <>
                <Spinner aria-hidden="true" data-icon="inline-start" />
                Saving...
              </>
            ) : isUploading ? (
              <>
                <Spinner aria-hidden="true" data-icon="inline-start" />
                Uploading...
              </>
            ) : isGenerating ? (
              <>
                <Spinner aria-hidden="true" data-icon="inline-start" />
                Generating...
              </>
            ) : (
              <>
                <Save data-icon="inline-start" />
                Save
              </>
            )}
          </Button>

          <ThemeToggle className="hidden sm:inline-flex" />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="More actions" type="button" />}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onPreview ? (
                <DropdownMenuItem className="sm:hidden" onClick={onPreview}>
                  <Eye />
                  Preview
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={onCancel}>Discard changes</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PageContainer>
    </header>
  );
};
