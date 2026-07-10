import { Link } from 'react-router-dom';
import { FileText, List, Play, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  buildConsoleTemplateEditPath,
  buildConsoleTemplatePath,
} from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

type TemplateListItemProps = {
  onDelete: (id: string) => void;
  onStartRun: (id: string) => void;
  template: ChecklistTemplate;
};

export function TemplateListItem({
  onDelete,
  onStartRun,
  template,
}: TemplateListItemProps) {
  const sectionCount = template.sections.length;
  const taskCount = template.sections.reduce(
    (count, section) => count + section.items.length,
    0,
  );

  return (
    <div className="group flex flex-col gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-muted-foreground/30 md:flex-row md:items-center">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary">
        {template.type === 'recipe' ? (
          <List className="h-5 w-5 text-muted-foreground" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <Link
          to={buildConsoleTemplatePath(template.id)}
          className="text-sm font-medium text-foreground hover:underline"
        >
          {template.title}
        </Link>
        {template.description ? (
          <p className="truncate text-xs text-muted-foreground">
            {template.description}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground md:gap-6">
        <span>{sectionCount} sections</span>
        <span>{taskCount} tasks</span>
        <span>{template.isPublic ? 'Public' : 'Private'}</span>
      </div>

      <div className="flex items-center gap-2 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onStartRun(template.id)}
        >
          <Play className="mr-2 h-4 w-4" />
          Start Run
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to={buildConsoleTemplateEditPath(template.id)}>Edit</Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(template.id)}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
