import React from 'react';
import { Eye, FileText, List, Play } from 'lucide-react';

import { MediaCard, MediaCardCategories, MediaCardHoverAction } from '@/components/layout/MediaCard';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  buildCanonicalPublicTemplatePath,
  buildPublicProfilePath,
} from '@/lib/routes';
import { uniqueCategoryNames } from '@/lib/categorySlug';
import { countTemplateItems } from '@/lib/templates/templateItemCount';
import { cn } from '@/lib/utils';
import { formatCount, pluralize } from '@/lib/utils/pluralize';
import type { ChecklistTemplate } from '@/types/checklist';
import { generateSlug } from '@/utils/urlHelpers';
import {
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
  titleAs?: 'h2' | 'h3';
}

export const TemplateCard: React.FC<TemplateCardProps> = ({ layout = 'vertical', template, titleAs }) => {
  const sectionCount = getTemplateSectionCount(template);
  const itemCount = countTemplateItems(template);
  const ownerLabel = getTemplateOwnerLabel(template);
  const ownerHandle = template.ownerProfile?.username;
  const categories = uniqueCategoryNames(template.categories ?? []);
  const templatePath = buildCanonicalPublicTemplatePath({
    ...template,
    slug: template.slug ?? generateSlug(template.title),
  });
  const ownerInitial = ownerLabel.charAt(0).toUpperCase() || 'U';
  const TypeIcon = template.type === 'recipe' ? List : FileText;
  const owner = (
    <>
      <Avatar size="sm" className="size-5">
        <AvatarFallback className="text-[10px]">{ownerInitial}</AvatarFallback>
      </Avatar>
      {ownerHandle ? <span className="truncate">{ownerHandle}</span> : null}
    </>
  );

  return (
    <MediaCard
      clampDescription
      description={template.description || undefined}
      eyebrow={categories.length > 0 ? <MediaCardCategories categories={categories} /> : undefined}
      href={templatePath}
      icon={<TypeIcon />}
      orientation={layout}
      mediaOverlay={
        templatePath ? (
          <MediaCardHoverAction>
            <Link tabIndex={-1} href={templatePath} className={buttonVariants()}>
              <Eye data-icon="inline-start" />
              View Template
            </Link>
          </MediaCardHoverAction>
        ) : undefined
      }
      title={template.title}
      titleAs={titleAs}
    >
      <p className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatCount(sectionCount, 'section')}</span>
        <span>{formatCount(itemCount, 'task')}</span>
        {typeof template.viewCount === 'number' ? (
          <span className="ml-auto">{template.viewCount.toLocaleString()} {pluralize(template.viewCount, 'view')}</span>
        ) : null}
      </p>
      <div className="flex items-center justify-between gap-2 border-t pt-3">
        {ownerHandle ? (
          <Link
            className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            href={buildPublicProfilePath(ownerHandle)}
          >
            {owner}
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-2">{owner}</div>
        )}

        {templatePath ? (
          <Link
            href={templatePath}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-mr-2')}
          >
            <Play data-icon="inline-start" />
            Start
          </Link>
        ) : null}
      </div>
    </MediaCard>
  );
};
