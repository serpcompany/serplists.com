import React from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileText, List, Play } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  buildCanonicalPublicTemplatePath,
  buildPublicCategoryPath,
  buildPublicProfilePath,
  buildRunPath,
} from '@/lib/routes';
import { cn } from '@/lib/utils';
import type { ChecklistTemplate } from '@/types/checklist';
import {
  getTemplateItemCount,
  getTemplateOwnerLabel,
  getTemplateSectionCount,
} from '@/components/checklist-library/discovery-utils';

interface TemplateCardProps {
  layout?: 'horizontal' | 'vertical';
  template: ChecklistTemplate & {
    copyCount?: number;
    runCount?: number;
    viewCount?: number;
  };
  onTemplateClick: (template: ChecklistTemplate) => void;
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
  onTemplateClick,
}) => {
  const sectionCount = getTemplateSectionCount(template);
  const itemCount = getTemplateItemCount(template);
  const ownerLabel = getTemplateOwnerLabel(template);
  const ownerHandle = template.ownerProfile?.username;
  const categories = template.categories ?? [];
  const templatePath = buildCanonicalPublicTemplatePath(template);
  const isHorizontal = layout === 'horizontal';
  const ownerInitial = ownerHandle
    ? ownerLabel.charAt(0).toUpperCase()
    : 'U';

  const handleCardClick = () => {
    onTemplateClick(template);
  };

  const handleCategoryClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Card
      className={cn(
        'group overflow-hidden border-border bg-card transition-all hover:border-muted-foreground/30 hover:shadow-lg hover:shadow-black/5',
        isHorizontal ? 'flex' : 'flex flex-col',
      )}
      onClick={handleCardClick}
    >
      <CardContent
        className={cn(
          'flex flex-1 p-0',
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

          <div className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onTemplateClick(template);
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              View Template
            </Button>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          {categories.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1">
              {categories.slice(0, 2).map((category) => (
                <Link
                  key={category}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                  onClick={handleCategoryClick}
                  to={buildPublicCategoryPath(category)}
                >
                  {category}
                </Link>
              ))}
            </div>
          ) : null}

          <button
            className="block text-left"
            onClick={(event) => {
              event.stopPropagation();
              onTemplateClick(template);
            }}
            type="button"
          >
            <h3 className="mb-1 line-clamp-1 text-sm font-medium text-foreground transition-colors group-hover:text-primary">
              {template.title}
            </h3>
            {template.description ? (
              <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
                {template.description}
              </p>
            ) : null}
          </button>

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
                onClick={(event) => event.stopPropagation()}
                to={buildPublicProfilePath(ownerHandle)}
              >
                <Avatar className="h-5 w-5">
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
                  <AvatarFallback className="text-[10px]">
                    {ownerInitial}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}

            <Button asChild className="h-7 px-2 text-xs" size="sm" variant="ghost">
              <Link
                onClick={(event) => event.stopPropagation()}
                to={buildRunPath(template.id)}
              >
                <Play className="mr-1 h-3 w-3" />
                Start
              </Link>
            </Button>
          </div>

        </div>
      </CardContent>
    </Card>
  );
};
