import { FileText, List, Sparkles } from 'lucide-react';

import { CardGrid } from '@/components/layout/CardGrid';
import { MediaCard } from '@/components/layout/MediaCard';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { countTemplateItems } from '@/lib/templates/templateItemCount';
import { formatCount } from '@/lib/utils/pluralize';
import type { ChecklistTemplate } from '@/types/checklist';

type ProfileTemplateCardsProps = {
  handle: string;
  templatePath: (template: ChecklistTemplate) => string;
  templates: ChecklistTemplate[];
};

export function ProfileTemplateCards({ handle, templatePath, templates }: ProfileTemplateCardsProps) {
  return (
    <section aria-labelledby="public-templates">
      <SectionHeader
        description="Browse every public template published from this profile."
        id="public-templates"
        title="Public Templates"
      />

      {templates.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sparkles />
            </EmptyMedia>
            <EmptyTitle>
              <h3>No public templates</h3>
            </EmptyTitle>
            <EmptyDescription className="wrap-anywhere">
              @{handle} has not published any public templates yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <CardGrid>
          {templates.map((template) => {
            const TypeIcon = template.type === 'recipe' ? List : FileText;
            const categories = (template.categories || []).slice(0, 3);
            return (
              <MediaCard
                key={template.id}
                clampDescription
                description={
                  template.description || 'Public template pack published in this creator profile.'
                }
                eyebrow={
                  categories.length ? (
                    <span className="flex flex-wrap gap-1">
                      {categories.map((category) => (
                        <Badge key={category} variant="secondary">
                          {category}
                        </Badge>
                      ))}
                    </span>
                  ) : undefined
                }
                href={templatePath(template)}
                icon={<TypeIcon />}
                title={template.title}
              >
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="min-w-0 wrap-anywhere">@{handle}</span>
                  <span>{formatCount(template.sections.length, 'section')}</span>
                  <span>{formatCount(countTemplateItems(template), 'item')}</span>
                </p>
              </MediaCard>
            );
          })}
        </CardGrid>
      )}
    </section>
  );
}
