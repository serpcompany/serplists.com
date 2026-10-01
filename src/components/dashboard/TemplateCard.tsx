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

import { MediaCard } from '@/components/layout/MediaCard';
import { Badge } from '@/components/ui/badge';
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
import { formatCount } from '@/lib/utils/pluralize';
import type { ChecklistTemplate } from '@/types/checklist';

import { Link } from '@/components/navigation/Link';

interface TemplateCardProps {
  template: ChecklistTemplate;
  canEdit?: boolean;
  onDelete?: ((id: string) => void) | undefined;
  onDuplicate?: (id: string) => void;
  onStartRun?: ((id: string) => void) | undefined;
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
  const categories = template.categories ?? [];
  const TypeIcon = template.type === 'recipe' ? List : FileText;

  return (
    <MediaCard
      titleAs="h2"
      action={
        hasMenuActions ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={actionsLabel}
                  className={cn('data-popup-open:opacity-100', HOVER_REVEAL_CLASS)}
                  size="icon"
                  variant="secondary"
                />
              }
            >
              <MoreHorizontal aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit ? (
                <DropdownMenuItem render={<Link href={buildConsoleTemplateEditPath(template.id)} />}>
                  <Edit3 />
                  Edit
                </DropdownMenuItem>
              ) : null}
              {onStartRun ? (
                <DropdownMenuItem onClick={() => onStartRun(template.id)}>
                  <Play />
                  Start Run
                </DropdownMenuItem>
              ) : null}
              {onDuplicate ? (
                <DropdownMenuItem onClick={() => onDuplicate(template.id)}>
                  <Copy />
                  Duplicate
                </DropdownMenuItem>
              ) : null}
              {onDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(template.id)} variant="destructive">
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
      clampDescription
      description={template.description || undefined}
      eyebrow={
        categories.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {categories.slice(0, 2).map((category) => (
              <Badge key={category} variant="secondary">
                {category}
              </Badge>
            ))}
            {categories.length > 2 ? <Badge variant="secondary">+{categories.length - 2}</Badge> : null}
          </span>
        ) : undefined
      }
      href={buildConsoleTemplatePath(template.id)}
      icon={<TypeIcon />}
      mediaOverlay={
        onStartRun ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/80 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:hidden"
          >
            <Button className="relative z-10" onClick={() => onStartRun(template.id)} tabIndex={-1}>
              <Play data-icon="inline-start" />
              Start Run
            </Button>
          </div>
        ) : undefined
      }
      title={template.title}
    >
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{formatCount(sectionCount, 'section')}</span>
        <span>{formatCount(taskCount, 'task')}</span>
        <span className="ml-auto flex items-center gap-1">
          {template.isPublic ? (
            <Globe aria-hidden="true" className="size-3" />
          ) : (
            <Lock aria-hidden="true" className="size-3" />
          )}
          {template.isPublic ? 'Public' : 'Private'}
        </span>
      </p>
    </MediaCard>
  );
}
