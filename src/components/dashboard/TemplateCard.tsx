import {
  Copy,
  Edit3,
  FileText,
  Globe,
  List,
  Lock,
  MoreHorizontal,
  Play,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HOVER_REVEAL_CLASS } from '@/components/ui/hover-reveal';
import { buildConsoleTemplateEditPath, buildConsoleTemplatePath } from '@/lib/routes';
import { cn } from '@/lib/utils';
import type { ChecklistTemplate } from '@/types/checklist';

import { Link } from '@/components/navigation/Link';

// Actions follow the member role: omit a handler, or pass canEdit={false}, to hide one.
interface TemplateCardProps {
  template: ChecklistTemplate;
  canEdit?: boolean;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onStartRun?: (id: string) => void;
}

export function TemplateCard({
  template,
  canEdit = true,
  onDelete,
  onDuplicate,
  onStartRun,
}: TemplateCardProps) {
  const hasMenuActions = canEdit || Boolean(onStartRun || onDuplicate || onDelete);
  const sectionCount = template.sections.length;
  const taskCount = template.sections.reduce(
    (total, section) => total + section.items.length,
    0,
  );
  const title = template.title.trim();
  const actionsLabel = title ? `Actions for ${title}` : 'Template actions';

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-muted-foreground/30">
      <div className="flex h-24 items-center justify-center bg-secondary/50">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-background">
          {template.type === 'recipe' ? (
            <List className="h-6 w-6 text-muted-foreground" />
          ) : (
            <FileText className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-start justify-between">
          <div className="flex-1">
            <Link
              href={buildConsoleTemplatePath(template.id)}
              className="text-sm font-medium text-foreground hover:underline"
            >
              {template.title}
            </Link>
            {template.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {template.description}
              </p>
            ) : null}
          </div>

          {hasMenuActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={actionsLabel}
                    // The only way to these actions on a touch screen or from the keyboard.
                    className={cn('h-7 w-7 data-popup-open:opacity-100', HOVER_REVEAL_CLASS)}
                    size="icon"
                    variant="ghost"
                  />
                }
              >
                <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {canEdit ? (
                  <DropdownMenuItem render={<Link href={buildConsoleTemplateEditPath(template.id)} />}>
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                ) : null}
                {onStartRun ? (
                  <DropdownMenuItem onClick={() => onStartRun(template.id)}>
                    <Play className="mr-2 h-4 w-4" />
                    Start Run
                  </DropdownMenuItem>
                ) : null}
                {onDuplicate ? (
                  <DropdownMenuItem onClick={() => onDuplicate(template.id)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                ) : null}
                {onDelete ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onDelete(template.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {template.categories?.length ? (
          <div className="mb-3 flex flex-wrap gap-1">
            {template.categories.slice(0, 2).map((category) => (
              <span
                key={category}
                className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {category}
              </span>
            ))}
            {template.categories.length > 2 ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                +{template.categories.length - 2}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{sectionCount} sections</span>
            <span>{taskCount} tasks</span>
          </div>
          <div className="flex items-center gap-1">
            {template.isPublic ? (
              <>
                <Globe className="h-3 w-3" />
                <span>Public</span>
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" />
                <span>Private</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* A pointer shortcut only: keyboard, screen reader and touch users start runs from the
          actions menu, so this hidden, clipped copy never takes focus, and touch screens,
          where a tap can leave :hover stuck, never show it over the card. */}
      {onStartRun ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 translate-y-full bg-linear-to-t from-card to-transparent p-4 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:none)]:hidden"
        >
          <Button
            className="w-full"
            onClick={() => onStartRun(template.id)}
            size="sm"
            tabIndex={-1}
          >
            <Play className="mr-2 h-3.5 w-3.5" />
            Start Run
          </Button>
        </div>
      ) : null}
    </div>
  );
}
