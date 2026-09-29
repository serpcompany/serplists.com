import React from 'react';
import { Eye, FileText, List, Play } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  buildCanonicalPublicTemplatePath,
  buildPublicProfilePath,
} from '@/lib/routes';
import { uniqueCategoryNames } from '@/lib/categorySlug';
import { cn } from '@/lib/utils';
import type { ChecklistTemplate } from '@/types/checklist';
import { generateSlug } from '@/utils/urlHelpers';
import {
  getTemplateItemCount,
  getTemplateOwnerLabel,
  getTemplateSectionCount,
} from '@/components/checklist-library/discovery-utils';

import { Link } from '@/components/navigation/Link';

interface TemplateCardProps {
  layout?: 'horizontal' | 'vertical';
  template: ChecklistTemplate & {
    copyCount?: number;
    runCount?: number;
    viewCount?: number;
  };
}

const getTemplateIcon = (template: ChecklistTemplate) =>
  template.type === 'recipe' ? (
    <List className="h-7 w-7 text-muted-foreground" />
  ) : (
    <FileText className="h-7 w-7 text-muted-foreground" />
  );

export const TemplateCard: React.FC<TemplateCardProps> = ({
  layout = 'vertical',
  template,
}) => {
  const sectionCount = getTemplateSectionCount(template);
  const itemCount = getTemplateItemCount(template);
  const ownerLabel = getTemplateOwnerLabel(template);
  const ownerHandle = template.ownerProfile?.username;
  // Imported or API-written lists can repeat a category ('SEO', 'seo'); show each once.
  const categories = uniqueCategoryNames(template.categories ?? []);
  // Discovery lists only templates with a public URL; if one slips through, render it
  // without links rather than pointing them back at the library.
  const templatePath = buildCanonicalPublicTemplatePath({
    ...template,
    slug: template.slug ?? generateSlug(template.title),
  });
  const isHorizontal = layout === 'horizontal';
  const ownerInitial = ownerLabel.charAt(0).toUpperCase() || 'U';
  const summary = (
    <>
      <h3 className="mb-1 line-clamp-1 text-sm font-medium text-foreground transition-colors group-hover:text-primary">
        {template.title}
      </h3>
      {template.description ? (
        <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
          {template.description}
        </p>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        'group overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-muted-foreground/30 hover:shadow-lg hover:shadow-black/5',
        isHorizontal && 'flex',
      )}
    >
      <div
        className={cn(
          'flex flex-1',
          isHorizontal ? 'min-h-[12rem] flex-row' : 'flex-col',
        )}
      >
        <div
          className={cn(
            'relative flex items-center justify-center bg-gradient-to-br from-secondary to-secondary/50',
            isHorizontal ? 'w-44 shrink-0' : 'h-32',
          )}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-background shadow-sm">
            {getTemplateIcon(template)}
          </div>

          {/* A pointer shortcut only: the title and Start links reach the same page, so
              this copy, invisible until hover, never takes focus. */}
          {templatePath ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Button asChild>
                <Link tabIndex={-1} href={templatePath}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Template
                </Link>
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-4">
          {categories.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1">
              {categories.slice(0, 2).map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {category}
                </span>
              ))}
            </div>
          ) : null}

          {templatePath ? (
            <Link href={templatePath} className="block">
              {summary}
            </Link>
          ) : (
            <div>{summary}</div>
          )}

          <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span>{sectionCount} sections</span>
            <span>{itemCount} tasks</span>
            {typeof template.viewCount === 'number' ? (
              <span className="ml-auto">
                {template.viewCount.toLocaleString()} views
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            {ownerHandle ? (
              <Link
                className="flex min-w-0 items-center gap-2 transition-colors hover:text-foreground"
                href={buildPublicProfilePath(ownerHandle)}
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src="" />
                  <AvatarFallback className="text-[10px]">
                    {ownerInitial}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-xs text-muted-foreground">
                  {ownerHandle}
                </span>
              </Link>
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarImage src="" />
                  <AvatarFallback className="text-[10px]">
                    {ownerInitial}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}

            {templatePath ? (
              <Button asChild className="h-7 px-2 text-xs" size="sm" variant="ghost">
                <Link href={templatePath}>
                  <Play className="mr-1 h-3 w-3" />
                  Start
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
