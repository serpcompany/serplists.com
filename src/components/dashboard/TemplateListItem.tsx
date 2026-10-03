import { FileText, List, Pencil, Play, Trash2 } from 'lucide-react';

import { IconTile } from '@/components/layout/IconTile';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item';
import type { ConsoleContext } from '@/lib/consoleRoutes';
import {
  buildConsoleTemplateEditPath,
  buildConsoleTemplatePath,
} from '@/lib/routes';
import { resolveTemplateConsoleContext } from '@/lib/templateDestination';
import { countTemplateItems } from '@/lib/templates/templateItemCount';
import { formatCount } from '@/lib/utils/pluralize';
import type { ChecklistTemplate } from '@/types/checklist';

import { Link } from '@/components/navigation/Link';

type TemplateListItemProps = {
  canEdit?: boolean;
  context: ConsoleContext;
  onDelete?: ((id: string) => void) | undefined;
  onStartRun?: ((id: string) => void) | undefined;
  template: ChecklistTemplate;
};

export function TemplateListItem({
  canEdit = true,
  context,
  onDelete,
  onStartRun,
  template,
}: TemplateListItemProps) {
  const templateContext = resolveTemplateConsoleContext(template, context);
  const sectionCount = template.sections.length;
  const taskCount = countTemplateItems(template);
  const TypeIcon = template.type === 'recipe' ? List : FileText;
  const hasActions = Boolean(onStartRun || canEdit || onDelete);

  return (
    <Item className="group" role="listitem" variant="outline">
      <IconTile className="self-start" size="sm">
        <TypeIcon />
      </IconTile>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-2 wrap-anywhere">
          <Link
            href={buildConsoleTemplatePath(template.id, templateContext)}
            className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {template.title}
          </Link>
        </ItemTitle>
        {template.description ? (
          <ItemDescription className="line-clamp-1">{template.description}</ItemDescription>
        ) : null}
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>{formatCount(sectionCount, 'section')}</span>
          <span>{formatCount(taskCount, 'task')}</span>
          <span>{template.isPublic ? 'Public' : 'Private'}</span>
        </p>
      </ItemContent>
      {hasActions ? (
        <ItemActions className="basis-full justify-end md:basis-auto md:transition-opacity md:[@media(hover:hover)]:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          {onStartRun ? (
            <Button onClick={() => onStartRun(template.id)} size="sm" type="button" variant="outline">
              <Play data-icon="inline-start" />
              Start Run
            </Button>
          ) : null}
          {canEdit ? (
            <Link
              href={buildConsoleTemplateEditPath(template.id, templateContext)}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Link>
          ) : null}
          {onDelete ? (
            <Button onClick={() => onDelete(template.id)} size="sm" type="button" variant="destructive">
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          ) : null}
        </ItemActions>
      ) : null}
    </Item>
  );
}
