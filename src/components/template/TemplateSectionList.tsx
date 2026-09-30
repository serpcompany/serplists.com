import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getSectionDisplayTitle } from '@/lib/utils/checklistSections';
import { formatCount } from '@/lib/utils/pluralize';
import type { ChecklistItem, ChecklistSection } from '@/types/checklist';

type TemplateSectionListProps = {
  // Each section opens and closes from its header, starting open. Without it every section
  // stays open.
  collapsible?: boolean;
  sections: ChecklistSection[];
};

// A Template's sections as cards: the section's number, title and task count, over its
// numbered tasks with their descriptions and content blocks, read-only. The public template
// page's "What's included" and template detail's "Template Structure".
export function TemplateSectionList({ collapsible = true, sections }: TemplateSectionListProps) {
  // Closed sections by id, so a section that is added or moved keeps its state.
  const [closedSectionIds, setClosedSectionIds] = useState<Set<string>>(() => new Set());

  const setSectionOpen = (sectionId: string, open: boolean) => {
    setClosedSectionIds((current) => {
      const next = new Set(current);
      if (open) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4" data-slot="template-section-list">
      {sections.map((section, sectionIndex) =>
        collapsible ? (
          <Collapsible
            key={section.id}
            open={!closedSectionIds.has(section.id)}
            onOpenChange={(open) => setSectionOpen(section.id, open)}
            className="overflow-hidden rounded-xl ring-1 ring-foreground/10"
          >
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
              <SectionHeading index={sectionIndex} section={section} />
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t px-4 py-3">
              <TaskList items={section.items} />
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <div key={section.id} className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <div className="px-4 py-3">
              <SectionHeading index={sectionIndex} section={section} />
            </div>
            <div className="border-t px-4 py-3">
              <TaskList items={section.items} />
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function SectionHeading({ index, section }: { index: number; section: ChecklistSection }) {
  return (
    <span className="flex min-w-0 items-start gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {index + 1}
      </span>
      {/* The title wraps rather than cut off on a phone; the count follows it. */}
      <span className="min-w-0 pt-0.5 wrap-break-word">
        <span className="font-medium">{getSectionDisplayTitle(section, index)}</span>
        <span className="ml-2 text-xs whitespace-nowrap text-muted-foreground">
          {formatCount(section.items.length, 'task')}
        </span>
      </span>
    </span>
  );
}

function TaskList({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, itemIndex) => (
        <li key={item.id} className="flex items-start gap-3 py-1">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border text-xs text-muted-foreground">
            {itemIndex + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm wrap-break-word">{item.title}</p>
            {item.description ? (
              <p className="mt-0.5 text-xs leading-5 whitespace-pre-line text-muted-foreground">
                {item.description}
              </p>
            ) : null}
            {item.contents?.length ? (
              <div className="mt-3 text-sm">
                <ContentRenderer contents={item.contents} disabled subtaskHeadingAs="h3" />
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
