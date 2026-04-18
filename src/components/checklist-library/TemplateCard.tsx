import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, FileText, ListTodo } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import {
  buildPublicCategoryPath,
  buildPublicProfilePath,
} from '@/lib/routes';
import { cn } from '@/lib/utils';
import type { ChecklistTemplate } from '@/types/checklist';
import {
  getTemplateItemCount,
  getTemplateOwnerLabel,
  getTemplateSectionCount,
} from '@/components/checklist-library/discovery-utils';

interface TemplateCardProps {
  template: ChecklistTemplate;
  onTemplateClick: (template: ChecklistTemplate) => void;
}

const getTemplateIcon = (template: ChecklistTemplate) =>
  template.type === 'recipe' ? (
    <ListTodo className="h-7 w-7 text-muted-foreground" />
  ) : (
    <FileText className="h-7 w-7 text-muted-foreground" />
  );

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onTemplateClick,
}) => {
  const navigate = useNavigate();
  const sectionCount = getTemplateSectionCount(template);
  const itemCount = getTemplateItemCount(template);
  const ownerLabel = getTemplateOwnerLabel(template);
  const ownerHandle = template.ownerProfile?.username ?? template.userId;
  const categories = template.categories ?? [];

  const handleCategoryClick = (event: React.MouseEvent, category: string) => {
    event.preventDefault();
    event.stopPropagation();
    navigate(buildPublicCategoryPath(category));
  };

  return (
    <Card
      className={cn(
        'group h-full cursor-pointer overflow-hidden border-border bg-card/70 shadow-none transition-colors hover:border-border/80 hover:bg-secondary/20',
      )}
      onClick={() => onTemplateClick(template)}
    >
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex h-32 items-center justify-center border-b border-border/70 bg-gradient-to-br from-secondary/40 via-secondary/20 to-background">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background/90 shadow-sm">
            {getTemplateIcon(template)}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              TEMPLATE PACK
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>

          <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-foreground">
            {template.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {template.description ??
              'Reusable template pack ready to clone or run.'}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span>{sectionCount} sections</span>
            <span>{itemCount} items</span>
            <span>by {ownerLabel}</span>
          </div>

          {categories.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {categories.slice(0, 3).map((category) => (
                <Link
                  key={category}
                  className="inline-flex items-center rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-border hover:bg-muted/25 hover:text-foreground"
                  onClick={(event) => handleCategoryClick(event, category)}
                  to={buildPublicCategoryPath(category)}
                >
                  {category}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="mt-auto border-t border-border/70 pt-4">
            <div className="flex items-center justify-between gap-3">
              {template.ownerProfile?.username ? (
                <Link
                  to={buildPublicProfilePath(template.ownerProfile.username)}
                  onClick={(event) => event.stopPropagation()}
                  className="flex min-w-0 items-center gap-2"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold text-foreground">
                    {ownerLabel.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {ownerHandle}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold text-foreground">
                    {ownerLabel.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {ownerHandle}
                  </span>
                </div>
              )}

              <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <span>View template</span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
